/**
 * Redbubble Auto Uploader - Content Script
 * Injects sidebar and manages the automation process
 */

class RedbubbleAutoUploader {
  constructor() {
    this.images = [];
    this.currentIndex = 0;
    this.isUploading = false;
    this.csvData = null;

    this.init();
  }

  async init() {
    this.injectSidebar();
    this.attachEventListeners();

    // Try to restore upload session from background script
    await this.restoreFromBackground();

    this.updateUI();
  }

  injectSidebar() {
    // Check if sidebar already exists
    if (document.getElementById("rb-auto-uploader-sidebar")) {
      return;
    }

    const sidebar = document.createElement("div");
    sidebar.id = "rb-auto-uploader-sidebar";
    sidebar.innerHTML = `
      <div class="rb-sidebar-header">
        Redbubble Auto Uploader
      </div>
      <div class="rb-sidebar-content">
        <!-- Status Messages -->
        <div id="rb-status-container"></div>

        <!-- Upload Section -->
        <div class="rb-section">
          <div class="rb-section-title">1. Select Images</div>
          <input type="file" id="rb-image-input" class="rb-file-input" multiple accept="image/*">
          <label for="rb-image-input" class="rb-file-button">
            📁 Choose Images
          </label>
          <div id="rb-selected-count" style="margin-top: 10px; font-size: 12px; color: #666;"></div>
        </div>

        <!-- CSV Upload Section -->
        <div class="rb-section">
          <div class="rb-section-title">2. Upload CSV (Optional)</div>
          <input type="file" id="rb-csv-input" class="rb-file-input" accept=".csv">
          <label for="rb-csv-input" class="rb-file-button">
            📄 Upload CSV
          </label>
          <div id="rb-csv-status" style="margin-top: 10px; font-size: 12px; color: #666;"></div>
          <div style="margin-top: 10px; font-size: 11px; color: #888;">
            CSV Format: image_name, title, tags, description
          </div>
        </div>

        <!-- Current Image Info -->
        <div class="rb-section rb-hidden" id="rb-current-section">
          <div class="rb-section-title">Current Image</div>
          <div class="rb-current-image-info">
            <div class="rb-current-image-title">File:</div>
            <div class="rb-current-image-name" id="rb-current-image-name">-</div>
          </div>
          <div class="rb-navigation">
            <button class="rb-nav-button" id="rb-prev-button">← Previous</button>
            <button class="rb-nav-button" id="rb-next-button">Next →</button>
          </div>
        </div>

        <!-- Manual Data Input Section -->
        <div class="rb-section" id="rb-manual-section">
          <div class="rb-section-title">3. Design Details</div>
          
          <div class="rb-input-group">
            <label class="rb-label" for="rb-title-input">Title *</label>
            <input type="text" id="rb-title-input" class="rb-input" placeholder="Enter title">
          </div>

          <div class="rb-input-group">
            <label class="rb-label" for="rb-tags-input">Tags (comma-separated)</label>
            <textarea id="rb-tags-input" class="rb-textarea" placeholder="tag1, tag2, tag3"></textarea>
          </div>

          <div class="rb-input-group">
            <label class="rb-label" for="rb-description-input">Description</label>
            <textarea id="rb-description-input" class="rb-textarea" placeholder="Enter description"></textarea>
          </div>
        </div>

        <!-- Image Queue -->
        <div class="rb-section rb-hidden" id="rb-queue-section">
          <div class="rb-section-title">Upload Queue</div>
          <div class="rb-image-list" id="rb-image-list"></div>
        </div>

        <!-- Progress -->
        <div class="rb-section rb-hidden" id="rb-progress-section">
          <div class="rb-section-title">Progress</div>
          <div class="rb-progress">
            <div class="rb-progress-bar">
              <div class="rb-progress-fill" id="rb-progress-fill" style="width: 0%"></div>
            </div>
            <div class="rb-progress-text" id="rb-progress-text">0 / 0</div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="rb-section">
          <button class="rb-button" id="rb-start-button" disabled>
            🚀 Start Upload
          </button>
          <button class="rb-button rb-button-secondary rb-hidden" id="rb-stop-button">
            ⏸️ Stop Upload
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(sidebar);
  }

  attachEventListeners() {
    // Image file input
    document
      .getElementById("rb-image-input")
      .addEventListener("change", (e) => {
        this.handleImageSelection(e.target.files);
      });

    // CSV file input
    document.getElementById("rb-csv-input").addEventListener("change", (e) => {
      this.handleCSVUpload(e.target.files[0]);
    });

    // Navigation buttons
    document.getElementById("rb-prev-button").addEventListener("click", () => {
      this.navigatePrevious();
    });

    document.getElementById("rb-next-button").addEventListener("click", () => {
      this.navigateNext();
    });

    // Start/Stop buttons
    document.getElementById("rb-start-button").addEventListener("click", () => {
      this.startUpload();
    });

    document.getElementById("rb-stop-button").addEventListener("click", () => {
      this.stopUpload();
    });

    // Manual input fields - update current image data
    ["rb-title-input", "rb-tags-input", "rb-description-input"].forEach(
      (id) => {
        document.getElementById(id).addEventListener("input", (e) => {
          this.updateCurrentImageData(id, e.target.value);
        });
      }
    );
  }

  async handleImageSelection(files) {
    if (!files || files.length === 0) return;

    this.showStatus("info", "Processing images...");

    // Convert files to base64 for storage in background
    const imagePromises = Array.from(files).map(async (file, index) => {
      const base64 = await this.fileToBase64(file);
      return {
        file: file, // Keep original File object for immediate use
        base64: base64, // Store base64 for background script
        name: file.name,
        type: file.type,
        size: file.size,
        title: "",
        tags: "",
        description: "",
        status: "pending",
        index: index,
      };
    });

    this.images = await Promise.all(imagePromises);
    this.currentIndex = 0;

    // Try to match with CSV data if already loaded
    if (this.csvData) {
      this.matchCSVData();
    }

    // Save to background script
    await this.saveToBackground();

    this.updateUI();
    this.showStatus("success", `${this.images.length} image(s) selected`);
  }

  async handleCSVUpload(file) {
    if (!file) return;

    try {
      const text = await this.readFileAsText(file);
      this.csvData = this.parseCSV(text);

      // Match with images if already selected
      if (this.images.length > 0) {
        this.matchCSVData();
      }

      this.updateUI();
      this.showStatus("success", `CSV loaded: ${this.csvData.length} rows`);
      document.getElementById(
        "rb-csv-status"
      ).textContent = `✓ ${this.csvData.length} entries loaded`;
    } catch (error) {
      this.showStatus("error", `CSV Error: ${error.message}`);
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  parseCSV(text) {
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error("CSV file is empty or invalid");
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      data.push(row);
    }

    return data;
  }

  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  matchCSVData() {
    if (!this.csvData || this.images.length === 0) return;

    this.images.forEach((image) => {
      const csvRow = this.csvData.find(
        (row) => row.image_name && image.name.includes(row.image_name)
      );

      if (csvRow) {
        image.title = csvRow.title || "";
        image.tags = csvRow.tags || "";
        image.description = csvRow.description || "";
      }
    });

    this.updateCurrentImageFields();
  }

  navigatePrevious() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.updateUI();
    }
  }

  navigateNext() {
    if (this.currentIndex < this.images.length - 1) {
      this.currentIndex++;
      this.updateUI();
    }
  }

  updateCurrentImageData(fieldId, value) {
    if (this.images.length === 0) return;

    const current = this.images[this.currentIndex];

    switch (fieldId) {
      case "rb-title-input":
        current.title = value;
        break;
      case "rb-tags-input":
        current.tags = value;
        break;
      case "rb-description-input":
        current.description = value;
        break;
    }

    this.updateImageList();

    // Save to background script
    this.saveToBackground();
  }

  updateCurrentImageFields() {
    if (this.images.length === 0) return;

    const current = this.images[this.currentIndex];
    document.getElementById("rb-title-input").value = current.title;
    document.getElementById("rb-tags-input").value = current.tags;
    document.getElementById("rb-description-input").value = current.description;
  }

  updateUI() {
    const hasImages = this.images.length > 0;

    // Update current image name
    if (hasImages) {
      document.getElementById("rb-current-image-name").textContent =
        this.images[this.currentIndex].name;
      document.getElementById(
        "rb-selected-count"
      ).textContent = `✓ ${this.images.length} image(s) selected`;
    } else {
      document.getElementById("rb-current-image-name").textContent = "-";
      document.getElementById("rb-selected-count").textContent = "";
    }

    // Show/hide sections
    document
      .getElementById("rb-current-section")
      .classList.toggle("rb-hidden", !hasImages);
    document
      .getElementById("rb-queue-section")
      .classList.toggle("rb-hidden", !hasImages);
    document
      .getElementById("rb-progress-section")
      .classList.toggle("rb-hidden", !hasImages);

    // Update navigation buttons
    document.getElementById("rb-prev-button").disabled =
      this.currentIndex === 0;
    document.getElementById("rb-next-button").disabled =
      this.currentIndex >= this.images.length - 1;

    // Update start button
    const canStart =
      hasImages &&
      !this.isUploading &&
      this.images.some((img) => img.status === "pending");
    document.getElementById("rb-start-button").disabled = !canStart;

    // Update fields
    this.updateCurrentImageFields();
    this.updateImageList();
    this.updateProgress();
  }

  updateImageList() {
    const listContainer = document.getElementById("rb-image-list");

    if (this.images.length === 0) {
      listContainer.innerHTML =
        '<div style="text-align: center; color: #888;">No images selected</div>';
      return;
    }

    listContainer.innerHTML = this.images
      .map(
        (img, index) => `
      <div class="rb-image-item ${index === this.currentIndex ? "active" : ""}">
        <span class="rb-image-name">${img.name}</span>
        <span class="rb-image-status">${this.getStatusEmoji(img.status)}</span>
      </div>
    `
      )
      .join("");
  }

  getStatusEmoji(status) {
    switch (status) {
      case "pending":
        return "⏳";
      case "uploading":
        return "⬆️";
      case "completed":
        return "✅";
      case "error":
        return "❌";
      default:
        return "⏳";
    }
  }

  updateProgress() {
    if (this.images.length === 0) return;

    const completed = this.images.filter(
      (img) => img.status === "completed"
    ).length;
    const total = this.images.length;
    const percentage = (completed / total) * 100;

    document.getElementById("rb-progress-fill").style.width = `${percentage}%`;
    document.getElementById(
      "rb-progress-text"
    ).textContent = `${completed} / ${total}`;
  }

  showStatus(type, message) {
    const container = document.getElementById("rb-status-container");
    const statusDiv = document.createElement("div");
    statusDiv.className = `rb-status ${type}`;
    statusDiv.textContent = message;

    container.innerHTML = "";
    container.appendChild(statusDiv);

    // Auto-hide success messages after 5 seconds
    if (type === "success") {
      setTimeout(() => {
        if (statusDiv.parentNode) {
          statusDiv.remove();
        }
      }, 5000);
    }
  }

  async startUpload() {
    this.isUploading = true;
    document.getElementById("rb-start-button").classList.add("rb-hidden");
    document.getElementById("rb-stop-button").classList.remove("rb-hidden");

    this.showStatus("info", "Starting upload process...");

    // Find first pending image
    const startIndex = this.images.findIndex((img) => img.status === "pending");
    if (startIndex !== -1) {
      this.currentIndex = startIndex;
      this.updateUI();
    }

    await this.processUploadQueue();
  }

  stopUpload() {
    this.isUploading = false;
    document.getElementById("rb-start-button").classList.remove("rb-hidden");
    document.getElementById("rb-stop-button").classList.add("rb-hidden");
    this.showStatus("warning", "Upload stopped by user");
    this.updateUI();
  }

  async processUploadQueue() {
    for (let i = 0; i < this.images.length; i++) {
      if (!this.isUploading) {
        break;
      }

      const image = this.images[i];

      if (image.status !== "pending") {
        continue;
      }

      this.currentIndex = i;
      this.updateUI();

      try {
        await this.uploadSingleImage(image);
        // Note: uploadSingleImage sets status and may navigate away
        // If navigation happens, this code won't continue
      } catch (error) {
        image.status = "error";
        this.showStatus(
          "error",
          `❌ Error uploading "${image.name}": ${error.message}`
        );
        console.error("Upload error:", error);

        // Save session even on error
        await this.saveSession();
      }

      this.updateUI();

      // Check if we're still on the page (no navigation occurred)
      // If uploadSingleImage navigated away, we won't reach here
      const remainingPending = this.images.filter(
        (img) => img.status === "pending"
      ).length;
      if (remainingPending === 0) {
        // All done!
        break;
      }

      // Small wait before checking next image
      await this.sleep(1000);
    }

    // Only show completion if we're still uploading and on the same page
    if (this.isUploading) {
      this.isUploading = false;
      document.getElementById("rb-start-button").classList.remove("rb-hidden");
      document.getElementById("rb-stop-button").classList.add("rb-hidden");

      const completed = this.images.filter(
        (img) => img.status === "completed"
      ).length;

      await this.clearSession();

      this.showStatus(
        "success",
        `🎉 Upload complete! ${completed} of ${this.images.length} images uploaded successfully.`
      );
    }
  }

  async uploadSingleImage(image) {
    image.status = "uploading";
    this.updateUI();
    this.showStatus("info", `Uploading: ${image.name}`);

    // Validate required fields
    if (!image.title || image.title.trim() === "") {
      throw new Error("Title is required");
    }

    try {
      // Step 1: Upload the image file
      console.log("Step 1: Uploading image file...");
      await this.uploadImageFile(image.file);

      // Step 2: Wait for upload to complete
      console.log("Step 2: Waiting for upload completion...");
      await this.waitForUploadCompletion();

      // Step 2.5: Debug - check what's on the page
      console.log("Step 2.5: Checking page state...");
      this.debugPageElements();

      // Step 3: Wait for form to be ready after upload
      console.log("Step 3: Waiting for form to load...");
      await this.sleep(3000);

      // Step 4: Fill in the form
      console.log("Step 4: Filling form fields...");
      await this.fillFormFields(image);

      // Step 5: Set content options
      console.log("Step 5: Setting content options...");
      await this.setContentOptions();

      // Step 6: Wait a bit before submitting
      console.log("Step 6: Preparing to submit...");
      await this.sleep(1000);

      // Step 7: Submit the work
      console.log("Step 7: Submitting work...");
      await this.submitWork();

      // Step 8: Wait for submission to complete
      console.log("Step 8: Waiting for submission to complete...");
      await this.sleep(2000);

      // Step 9: Mark as completed and save to background
      image.status = "completed";
      await this.saveToBackground();
      this.updateUI();

      console.log("Step 9: Work submitted successfully!");
      this.showStatus("success", `✅ "${image.name}" submitted successfully!`);

      // Step 10: Check if there are more images to upload
      const remainingImages = this.images.filter(
        (img) => img.status === "pending"
      );

      if (remainingImages.length > 0) {
        console.log(
          `Step 10: ${remainingImages.length} images remaining. Navigating back to upload page...`
        );

        this.showStatus(
          "info",
          `✅ Uploaded! Navigating to next image (${remainingImages.length} remaining)...`
        );

        // Save state before page reload
        await this.saveToBackground();

        // Wait a bit for any redirects
        await this.sleep(2000);

        // Check if we're still on the upload page or got redirected
        const currentUrl = window.location.href;
        console.log("Current URL after submit:", currentUrl);

        // Navigate back to upload page (will reload and restore from background)
        if (!currentUrl.includes("/portfolio/images/new")) {
          console.log("Redirected away. Navigating back to upload page...");

          // Try clicking "Add another design" link
          const addLink = document.querySelector(
            'a[href="/portfolio/images/new"]'
          );
          if (addLink) {
            console.log("Clicking 'Add another design' link...");
            addLink.click();
          } else {
            console.log("Direct navigation to upload page...");
            window.location.href =
              "https://www.redbubble.com/portfolio/images/new";
          }
        } else {
          console.log("Still on upload page, reloading...");
          window.location.reload();
        }

        // Page will reload, and init() will restore data from background
        return;
      } else {
        console.log("All images uploaded!");
        await chrome.runtime.sendMessage({ action: "clearQueue" });
      }
    } catch (error) {
      console.error("Upload failed:", error);
      throw error;
    }
  }

  async uploadImageFile(file) {
    const fileInput = document.getElementById("select-image-single");

    if (!fileInput) {
      throw new Error("Image upload input not found on page");
    }

    console.log(
      `Uploading file: ${file.name} (${(file.size / 1024 / 1024).toFixed(
        2
      )} MB)`
    );

    // Create a DataTransfer object to set files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    console.log("File added to input, triggering events...");

    // Trigger multiple events to ensure it's detected
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    console.log("Upload events triggered, waiting for processing...");
    await this.sleep(2000);
  }

  async waitForUploadCompletion() {
    const maxAttempts = 150; // ~12 minutes max (150 * 5 seconds)
    let attempts = 0;

    console.log("Waiting for upload to complete...");

    while (attempts < maxAttempts) {
      // METHOD 1: Try to find the progress circle
      let progressElement = document.querySelector(".circle-progress");

      if (!progressElement) {
        progressElement = document.querySelector("[data-value]");
      }

      if (progressElement) {
        const progressValue = progressElement.getAttribute("data-value");
        const numericValue = parseFloat(progressValue);

        console.log(
          `Upload progress: ${progressValue} (${
            numericValue >= 1 ? numericValue : Math.round(numericValue * 100)
          }%)`
        );

        // Check for completion: "1", "1.0", "100", or value >= 1
        if (
          progressValue === "1" ||
          progressValue === "1.0" ||
          progressValue === "100" ||
          numericValue >= 1
        ) {
          // Upload complete
          console.log("Upload completed (100%)! Waiting for UI to settle...");
          await this.sleep(3000);
          return;
        }

        // Still uploading
        const displayPercent =
          numericValue >= 1 ? numericValue : Math.round(numericValue * 100);
        this.showStatus("info", `Uploading... (${displayPercent}%)`);
      } else {
        // METHOD 2: If no progress element, check if form fields have appeared
        // This means the upload is done
        const titleInput = document.getElementById("work_title_en");
        if (titleInput) {
          console.log("Form fields detected - upload appears complete!");
          await this.sleep(2000);
          return;
        }

        console.log(
          `Attempt ${attempts}: Waiting for upload to start/complete...`
        );
        this.showStatus("info", "Waiting for upload to complete...");
      }

      await this.sleep(5000);
      attempts++;
    }

    throw new Error("Upload timeout - image took too long to upload");
  }

  async fillFormFields(image) {
    // Wait for form fields to appear after upload
    let titleInput = null;
    let attempts = 0;

    // Try to find title input (wait up to 15 seconds)
    while (!titleInput && attempts < 30) {
      titleInput = document.getElementById("work_title_en");
      if (!titleInput) {
        await this.sleep(500);
        attempts++;
      }
    }

    if (!titleInput) {
      throw new Error("Title input field not found - form may not have loaded");
    }

    this.showStatus("info", "Filling in design details...");

    // Fill title
    this.setInputValue(titleInput, image.title);
    await this.sleep(500);

    // Fill tags
    if (image.tags) {
      const tagsInput = document.getElementById("work_tag_field_en");
      if (tagsInput) {
        this.setInputValue(tagsInput, image.tags);
        await this.sleep(500);
      } else {
        console.warn("Tags input field not found");
      }
    }

    // Fill description
    if (image.description) {
      const descInput = document.getElementById("work_description_en");
      if (descInput) {
        this.setInputValue(descInput, image.description);
        await this.sleep(500);
      } else {
        console.warn("Description input field not found");
      }
    }

    // Verify fields were filled
    console.log("Form filled:", {
      title: titleInput.value,
      tags: document.getElementById("work_tag_field_en")?.value,
      description: document.getElementById("work_description_en")?.value,
    });

    await this.sleep(1000);
  }

  setInputValue(element, value) {
    // Clear existing value first
    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));

    // Set new value
    element.value = value;

    // Trigger multiple events to ensure Redbubble's form detects the change
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));

    // Also try setting focus to trigger any validation
    element.focus();
    element.blur();
  }

  async setContentOptions() {
    this.showStatus("info", "Setting content options...");

    // Set "Safe for work" to Yes (true)
    const safeForWorkYes = document.getElementById("work_safe_for_work_true");
    if (safeForWorkYes) {
      if (!safeForWorkYes.checked) {
        safeForWorkYes.click();
        await this.sleep(500);
      }
      console.log("Safe for work set to: Yes");
    } else {
      console.warn("Safe for work radio button not found");
    }

    // Check rights declaration
    const rightsCheckbox = document.getElementById("rightsDeclaration");
    if (rightsCheckbox) {
      if (!rightsCheckbox.checked) {
        rightsCheckbox.click();
        await this.sleep(500);
      }
      console.log("Rights declaration checked");
    } else {
      console.warn("Rights declaration checkbox not found");
    }

    await this.sleep(500);
  }

  async submitWork() {
    this.showStatus("info", "Submitting work...");

    const submitButton = document.getElementById("submit-work");

    if (!submitButton) {
      throw new Error("Submit button not found");
    }

    if (submitButton.disabled) {
      throw new Error("Submit button is disabled - form may be incomplete");
    }

    console.log("Clicking submit button...");
    submitButton.click();
  }

  async clickAddAnotherDesign() {
    console.log("Looking for 'Add another design' link...");

    // Wait a bit for the success page to fully load
    await this.sleep(2000);

    // Try to find the "Add another design" link
    const addAnotherLink = document.querySelector(
      'a[href="/portfolio/images/new"]'
    );

    if (!addAnotherLink) {
      console.warn(
        "'Add another design' link not found, trying alternative selectors..."
      );

      // Try finding by text content
      const links = Array.from(document.querySelectorAll("a"));
      const linkByText = links.find(
        (link) =>
          link.textContent.includes("Add another design") ||
          link.textContent.includes("Add another")
      );

      if (linkByText) {
        console.log("Found 'Add another design' link by text content");
        linkByText.click();
        return;
      }

      throw new Error("Could not find 'Add another design' link");
    }

    console.log("Clicking 'Add another design' link...");
    addAnotherLink.click();
  }

  async saveSession() {
    // Save upload session to Chrome storage
    // Note: We can't save File objects, only metadata
    const sessionData = {
      imageCount: this.images.length,
      currentIndex: this.currentIndex,
      isUploading: this.isUploading,
      imageMetadata: this.images.map((img) => ({
        name: img.name,
        title: img.title,
        tags: img.tags,
        description: img.description,
        status: img.status,
        index: img.index,
      })),
      csvData: this.csvData,
      timestamp: Date.now(),
    };

    try {
      await chrome.storage.local.set({ uploadSession: sessionData });
      console.log("Session saved:", sessionData);
    } catch (error) {
      console.error("Failed to save session:", error);
    }
  }

  async restoreSession() {
    try {
      const result = await chrome.storage.local.get("uploadSession");
      const sessionData = result.uploadSession;

      if (!sessionData) {
        console.log("No session to restore");
        return;
      }

      // Check if session is recent (within 1 hour)
      const age = Date.now() - sessionData.timestamp;
      if (age > 3600000) {
        // 1 hour in milliseconds
        console.log("Session too old, clearing");
        await chrome.storage.local.remove("uploadSession");
        return;
      }

      // Restore CSV data
      if (sessionData.csvData) {
        this.csvData = sessionData.csvData;
        document.getElementById(
          "rb-csv-status"
        ).textContent = `✓ ${this.csvData.length} entries loaded (restored)`;
      }

      // Note: We can't restore File objects after page reload
      // User would need to select files again
      // But we can show a message
      if (sessionData.imageMetadata && sessionData.imageMetadata.length > 0) {
        this.showStatus(
          "warning",
          `Previous upload session detected with ${sessionData.imageCount} images. ` +
            `Please select your images again to continue.`
        );
      }

      console.log("Session restored:", sessionData);
    } catch (error) {
      console.error("Failed to restore session:", error);
    }
  }

  async clearSession() {
    try {
      await chrome.storage.local.remove("uploadSession");
      console.log("Session cleared");
    } catch (error) {
      console.error("Failed to clear session:", error);
    }
  }

  debugPageElements() {
    console.log("=== PAGE DEBUG INFO ===");

    // Check for common Redbubble form elements
    const elements = {
      "Title Input": document.getElementById("work_title_en"),
      "Tags Input": document.getElementById("work_tag_field_en"),
      "Description Input": document.getElementById("work_description_en"),
      "Safe for Work (Yes)": document.getElementById("work_safe_for_work_true"),
      "Rights Declaration": document.getElementById("rightsDeclaration"),
      "Submit Button": document.getElementById("submit-work"),
      "File Input": document.getElementById("select-image-single"),
      "Progress Circle": document.querySelector(".circle-progress"),
      "Data-value element": document.querySelector("[data-value]"),
    };

    for (const [name, element] of Object.entries(elements)) {
      if (element) {
        console.log(`✓ ${name}:`, element);
        if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
          console.log(`  Current value: "${element.value}"`);
        }
        if (element.hasAttribute("data-value")) {
          console.log(`  data-value: "${element.getAttribute("data-value")}"`);
        }
      } else {
        console.log(`✗ ${name}: NOT FOUND`);
      }
    }

    console.log("=== END DEBUG INFO ===");
  }

  // Background script communication methods
  async saveToBackground() {
    try {
      // Prepare data for background (without File objects)
      const dataToSave = {
        images: this.images.map((img) => ({
          base64: img.base64,
          name: img.name,
          type: img.type,
          size: img.size,
          title: img.title,
          tags: img.tags,
          description: img.description,
          status: img.status,
          index: img.index,
        })),
        currentIndex: this.currentIndex,
        isUploading: this.isUploading,
        csvData: this.csvData,
      };

      const response = await chrome.runtime.sendMessage({
        action: "saveQueue",
        data: dataToSave,
      });

      console.log("Data saved to background:", response);
    } catch (error) {
      console.error("Failed to save to background:", error);
    }
  }

  async restoreFromBackground() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getQueue",
      });

      if (
        response.success &&
        response.data &&
        response.data.images.length > 0
      ) {
        console.log("Restoring data from background:", response.data);

        // Reconstruct File objects from base64
        const imagePromises = response.data.images.map(async (imgData) => {
          const file = await this.base64ToFile(
            imgData.base64,
            imgData.name,
            imgData.type
          );
          return {
            file: file,
            base64: imgData.base64,
            name: imgData.name,
            type: imgData.type,
            size: imgData.size,
            title: imgData.title,
            tags: imgData.tags,
            description: imgData.description,
            status: imgData.status,
            index: imgData.index,
          };
        });

        this.images = await Promise.all(imagePromises);
        this.currentIndex = response.data.currentIndex;
        this.isUploading = response.data.isUploading;
        this.csvData = response.data.csvData;

        console.log(`Restored ${this.images.length} images from background`);

        // Update CSV status if present
        if (this.csvData) {
          document.getElementById(
            "rb-csv-status"
          ).textContent = `✓ ${this.csvData.length} entries loaded (restored)`;
        }

        // Show status message
        const pending = this.images.filter(
          (img) => img.status === "pending"
        ).length;
        if (pending > 0) {
          this.showStatus(
            "info",
            `Session restored! ${pending} image(s) pending. Auto-continuing upload...`
          );

          // Automatically continue upload after a short delay
          setTimeout(() => {
            console.log("Auto-continuing upload after session restore...");
            this.startUpload();
          }, 2000);
        }
      } else {
        console.log("No queue data to restore");
      }
    } catch (error) {
      console.error("Failed to restore from background:", error);
    }
  }

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async base64ToFile(base64, fileName, fileType) {
    const response = await fetch(base64);
    const blob = await response.blob();
    return new File([blob], fileName, { type: fileType });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Initialize the uploader when the page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new RedbubbleAutoUploader();
  });
} else {
  new RedbubbleAutoUploader();
}
