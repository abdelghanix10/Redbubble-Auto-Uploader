/**
 * Redbubble Auto Uploader - Side Panel Script
 * Handles UI and communicates with content script
 */

class SidePanelController {
  constructor() {
    this.images = [];
    this.currentIndex = 0;
    this.csvData = null;
    this.isUploading = false;
    this.currentTab = null;

    this.init();
  }

  async init() {
    await this.getCurrentTab();
    this.attachEventListeners();
    this.restoreState();
    this.updateUI();
  }

  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    this.currentTab = tab;
  }

  attachEventListeners() {
    // Image selection
    document
      .getElementById("rb-image-input")
      .addEventListener("change", (e) => {
        this.handleImageSelection(e.target.files);
      });

    // CSV upload
    document.getElementById("rb-csv-input").addEventListener("change", (e) => {
      this.handleCSVUpload(e.target.files[0]);
    });

    // Navigation buttons
    document.getElementById("rb-prev-button").addEventListener("click", () => {
      this.navigateImages(-1);
    });

    document.getElementById("rb-next-button").addEventListener("click", () => {
      this.navigateImages(1);
    });

    // Control buttons
    document.getElementById("rb-start-button").addEventListener("click", () => {
      this.startUpload();
    });

    document.getElementById("rb-stop-button").addEventListener("click", () => {
      this.stopUpload();
    });

    document.getElementById("rb-clear-button").addEventListener("click", () => {
      this.clearAll();
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      // Don't return true here - let handleMessage decide
    });
  }

  handleMessage(message, sender, sendResponse) {
    console.log("Side panel received message:", message.action);

    switch (message.action) {
      case "updateStatus":
        this.showStatus(message.text, message.type);
        // No need to send response for fire-and-forget messages
        break;
      case "updateProgress":
        this.updateProgress(message.current, message.total);
        // No need to send response for fire-and-forget messages
        break;
      case "uploadComplete":
        this.handleUploadComplete();
        // No need to send response for fire-and-forget messages
        break;
      case "getFormData":
        const formData = this.getFormDataForCurrentImage();
        sendResponse(formData);
        return true; // Keep channel open for async response
      case "getCurrentImage":
        this.getCurrentImageFile().then((imageFile) => {
          sendResponse(imageFile);
        });
        return true; // Keep channel open for async response
    }

    return false; // Close channel immediately for non-async messages
  }

  async handleImageSelection(files) {
    if (!files || files.length === 0) return;

    // Convert FileList to Array
    this.images = Array.from(files).map((file, index) => ({
      file: file,
      name: file.name,
      status: "pending",
      id: Date.now() + index,
    }));

    this.currentIndex = 0;
    await this.saveState();
    this.updateFormFieldsFromCSV();
    this.updateUI();
    this.showStatus(`${files.length} image(s) selected`, "success");
  }

  async handleCSVUpload(file) {
    if (!file) return;

    const text = await file.text();
    this.csvData = this.parseCSV(text);

    await this.saveState();
    this.updateFormFieldsFromCSV();
    this.updateUI();

    document.getElementById(
      "rb-csv-status"
    ).textContent = `✓ CSV loaded with ${this.csvData.length} entries`;
    this.showStatus("CSV uploaded successfully", "success");
  }

  parseCSV(text) {
    const lines = text.split("\n").filter((line) => line.trim());
    const data = [];

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV properly handling quoted fields with commas
      const values = this.parseCSVLine(line);

      if (values.length >= 4) {
        data.push({
          image_name: values[0],
          title: values[1],
          tags: values[2],
          description: values[3],
        });
      }
    }

    console.log("CSV parsed:", data);
    return data;
  }

  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        // Field separator
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current.trim());

    return result;
  }

  navigateImages(direction) {
    const newIndex = this.currentIndex + direction;
    if (newIndex >= 0 && newIndex < this.images.length) {
      this.currentIndex = newIndex;
      this.updateFormFieldsFromCSV();
      this.updateUI();
    }
  }

  updateFormFieldsFromCSV() {
    if (!this.images[this.currentIndex]) return;

    const currentImage = this.images[this.currentIndex];

    console.log("Updating form fields for image:", currentImage.name);
    console.log("CSV data available:", this.csvData);

    // Clear form fields first
    document.getElementById("rb-title-input").value = "";
    document.getElementById("rb-tags-input").value = "";
    document.getElementById("rb-description-input").value = "";

    // Try to get data from CSV
    if (this.csvData) {
      const csvEntry = this.csvData.find(
        (entry) =>
          entry.image_name === currentImage.name ||
          entry.image_name === currentImage.name.replace(/\.[^/.]+$/, "")
      );

      console.log("CSV entry found:", csvEntry);

      if (csvEntry) {
        document.getElementById("rb-title-input").value = csvEntry.title || "";
        document.getElementById("rb-tags-input").value = csvEntry.tags || "";
        document.getElementById("rb-description-input").value =
          csvEntry.description || "";
        console.log("Form fields populated from CSV");
      }
    }
  }

  getFormDataForCurrentImage() {
    if (!this.images[this.currentIndex]) return null;

    const currentImage = this.images[this.currentIndex];
    let formData = {
      title: "",
      tags: "",
      description: "",
    };

    // Try to get data from CSV first
    if (this.csvData) {
      const csvEntry = this.csvData.find(
        (entry) =>
          entry.image_name === currentImage.name ||
          entry.image_name === currentImage.name.replace(/\.[^/.]+$/, "")
      );

      if (csvEntry) {
        formData = {
          title: csvEntry.title || "",
          tags: csvEntry.tags || "",
          description: csvEntry.description || "",
        };
      }
    }

    // Override with manual inputs if they exist
    const titleInput = document.getElementById("rb-title-input").value.trim();
    const tagsInput = document.getElementById("rb-tags-input").value.trim();
    const descInput = document
      .getElementById("rb-description-input")
      .value.trim();

    if (titleInput) formData.title = titleInput;
    if (tagsInput) formData.tags = tagsInput;
    if (descInput) formData.description = descInput;

    return formData;
  }

  async getCurrentImageFile() {
    if (!this.images[this.currentIndex]) return null;

    const imageData = this.images[this.currentIndex];

    // Convert file to base64 for message passing
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: imageData.name,
          type: imageData.file.type,
          data: reader.result,
        });
      };
      reader.readAsDataURL(imageData.file);
    });
  }

  async startUpload() {
    if (this.images.length === 0) {
      this.showStatus("Please select images first", "error");
      return;
    }

    this.isUploading = true;
    await this.saveState();
    this.updateUI();

    // Send message to content script through background script
    const imageFile = await this.getCurrentImageFile();
    const formData = this.getFormDataForCurrentImage();

    this.showStatus("Starting upload automation...", "info");

    try {
      // Send to background script, which will forward to content script
      const response = await chrome.runtime.sendMessage({
        action: "startUploadTask",
        imageFile: imageFile,
        formData: formData,
        currentIndex: this.currentIndex,
        totalImages: this.images.length,
      });

      if (response.success) {
        console.log("Upload task sent successfully");
      } else {
        throw new Error(response.error || "Failed to start upload");
      }
    } catch (error) {
      console.error("Failed to start upload:", error);
      this.showStatus("Error: " + error.message, "error");
      this.isUploading = false;
      this.updateUI();
    }
  }

  stopUpload() {
    this.isUploading = false;
    this.saveState();
    this.updateUI();

    try {
      chrome.tabs.sendMessage(this.currentTab.id, {
        action: "stopUpload",
      });
    } catch (error) {
      console.error("Failed to send stop message:", error);
    }

    this.showStatus("Upload stopped", "warning");
  }

  async handleUploadComplete() {
    // Mark current image as completed
    if (this.images[this.currentIndex]) {
      this.images[this.currentIndex].status = "completed";
    }

    // Move to next image
    if (this.currentIndex < this.images.length - 1) {
      this.currentIndex++;
      await this.saveState();
      this.updateUI();

      // Start next upload
      setTimeout(() => {
        this.startUpload();
      }, 2000);
    } else {
      // All done
      this.isUploading = false;
      await this.saveState();
      this.updateUI();
      this.showStatus("All uploads completed! 🎉", "success");
    }
  }

  clearAll() {
    if (confirm("Clear all data? This will reset the uploader.")) {
      this.images = [];
      this.currentIndex = 0;
      this.csvData = null;
      this.isUploading = false;

      document.getElementById("rb-image-input").value = "";
      document.getElementById("rb-csv-input").value = "";
      document.getElementById("rb-title-input").value = "";
      document.getElementById("rb-tags-input").value = "";
      document.getElementById("rb-description-input").value = "";
      document.getElementById("rb-csv-status").textContent = "";

      this.saveState();
      this.updateUI();
      this.showStatus("All data cleared", "info");
    }
  }

  async saveState() {
    // Save state to background script
    const state = {
      images: this.images.map((img) => ({
        name: img.name,
        status: img.status,
        id: img.id,
      })),
      currentIndex: this.currentIndex,
      isUploading: this.isUploading,
      csvData: this.csvData,
    };

    chrome.runtime.sendMessage({
      action: "savePanelState",
      state: state,
    });
  }

  async restoreState() {
    // Restore state from background script
    chrome.runtime.sendMessage({ action: "getPanelState" }, (response) => {
      if (response && response.state) {
        const state = response.state;
        this.currentIndex = state.currentIndex || 0;
        this.isUploading = state.isUploading || false;
        this.csvData = state.csvData || null;

        if (state.csvData) {
          document.getElementById(
            "rb-csv-status"
          ).textContent = `✓ CSV loaded with ${state.csvData.length} entries`;
        }

        this.updateUI();

        if (this.isUploading && this.images.length > 0) {
          this.showStatus("Session restored. Resume upload?", "info");
        }
      }
    });
  }

  updateUI() {
    // Update selected count
    document.getElementById("rb-selected-count").textContent =
      this.images.length > 0 ? `${this.images.length} image(s) selected` : "";

    // Update current image section
    const currentSection = document.getElementById("rb-current-section");
    if (this.images.length > 0) {
      currentSection.classList.remove("rb-hidden");
      document.getElementById("rb-current-image-name").textContent =
        this.images[this.currentIndex]?.name || "-";
    } else {
      currentSection.classList.add("rb-hidden");
    }

    // Update queue section
    const queueSection = document.getElementById("rb-queue-section");
    if (this.images.length > 0) {
      queueSection.classList.remove("rb-hidden");
      this.updateQueueList();
    } else {
      queueSection.classList.add("rb-hidden");
    }

    // Update progress section
    const progressSection = document.getElementById("rb-progress-section");
    if (
      this.isUploading ||
      this.images.some((img) => img.status === "completed")
    ) {
      progressSection.classList.remove("rb-hidden");
      this.updateProgressDisplay();
    } else {
      progressSection.classList.add("rb-hidden");
    }

    // Update buttons
    const startButton = document.getElementById("rb-start-button");
    const stopButton = document.getElementById("rb-stop-button");

    startButton.disabled = this.isUploading || this.images.length === 0;
    stopButton.disabled = !this.isUploading;

    // Update navigation buttons
    document.getElementById("rb-prev-button").disabled =
      this.currentIndex === 0 || this.isUploading;
    document.getElementById("rb-next-button").disabled =
      this.currentIndex >= this.images.length - 1 || this.isUploading;
  }

  updateQueueList() {
    const queueList = document.getElementById("rb-queue-list");
    queueList.innerHTML = "";

    this.images.forEach((image, index) => {
      const item = document.createElement("div");
      item.className = "rb-queue-item";
      if (index === this.currentIndex) item.classList.add("active");

      const statusIcon =
        {
          pending: "⏳",
          uploading: "🔄",
          completed: "✓",
          failed: "✗",
        }[image.status] || "⏳";

      item.innerHTML = `
        <span class="rb-queue-status">${statusIcon}</span>
        <span class="rb-queue-name">${image.name}</span>
      `;

      queueList.appendChild(item);
    });
  }

  updateProgressDisplay() {
    const completed = this.images.filter(
      (img) => img.status === "completed"
    ).length;
    const total = this.images.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById(
      "rb-progress-info"
    ).textContent = `${completed} / ${total} uploaded (${percentage}%)`;
    document.getElementById("rb-progress-fill").style.width = `${percentage}%`;
  }

  updateProgress(current, total) {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    document.getElementById(
      "rb-progress-info"
    ).textContent = `${current} / ${total} uploaded (${percentage}%)`;
    document.getElementById("rb-progress-fill").style.width = `${percentage}%`;
  }

  showStatus(text, type = "info") {
    const container = document.getElementById("rb-status-container");

    const statusEl = document.createElement("div");
    statusEl.className = `rb-status rb-status-${type}`;
    statusEl.textContent = text;

    container.innerHTML = "";
    container.appendChild(statusEl);

    // Auto-hide after 5 seconds for success/info messages
    if (type === "success" || type === "info") {
      setTimeout(() => {
        statusEl.remove();
      }, 5000);
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new SidePanelController();
});
