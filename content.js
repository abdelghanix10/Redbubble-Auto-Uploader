/**
 * Redbubble Auto Uploader - Content Script
 * Handles page automation and communicates with side panel
 */

class RedbubbleAutomation {
  constructor() {
    this.isUploading = false;
    this.currentUpload = null;

    this.init();
  }

  async init() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    console.log("Redbubble Auto Uploader: Content script loaded");
    console.log("Current URL:", window.location.href);

    // Check if we're on the promote page - redirect back to upload
    if (window.location.href.includes("/studio/promote/")) {
      console.log("On promote page, redirecting to upload page...");

      // Check if there's a pending upload task
      const response = await chrome.runtime.sendMessage({
        action: "getUploadTask",
      });
      if (response.success && response.task) {
        console.log("Upload task found, will resume after redirect");
        // Task will be picked up when we land on upload page
      }

      // Redirect to upload page
      await this.sleep(1000);
      window.location.href = "https://www.redbubble.com/portfolio/images/new";
      return;
    }

    // Check if we're on the upload page after a redirect
    if (window.location.href.includes("/portfolio/images/new")) {
      // Check if there's a pending upload task
      const response = await chrome.runtime.sendMessage({
        action: "getUploadTask",
      });
      if (response.success && response.task) {
        console.log("Found pending upload task, resuming...");

        // Notify panel that we're resuming
        this.sendMessageToPanel({ action: "uploadComplete" });

        // Clear the task first
        await chrome.runtime.sendMessage({ action: "clearUploadTask" });

        // Small delay to let page settle
        await this.sleep(2000);

        console.log("Auto-resuming upload after page load");
      }
    }
  }

  async handleMessage(message, sender, sendResponse) {
    console.log("Content script received message:", message.action);

    switch (message.action) {
      case "startUpload":
        // Start upload without blocking response
        this.startUpload(
          message.imageFile,
          message.formData,
          message.currentIndex,
          message.totalImages
        ).catch((error) => {
          console.error("Upload error in handler:", error);
        });
        // Respond immediately
        sendResponse({ success: true });
        break;
      case "stopUpload":
        this.stopUpload();
        sendResponse({ success: true });
        break;
    }
    return false; // No async response needed
  }

  async startUpload(imageFile, formData, currentIndex, totalImages) {
    if (this.isUploading) {
      console.log("Upload already in progress");
      return;
    }

    // Check if we're on the correct upload page
    if (!window.location.href.includes("/portfolio/images/new")) {
      console.log("Not on upload page, redirecting...");
      this.sendStatusToPanel("Redirecting to upload page...", "info");

      // Store the task for after redirect
      await chrome.runtime.sendMessage({
        action: "startUploadTask",
        imageFile: imageFile,
        formData: formData,
        currentIndex: currentIndex,
        totalImages: totalImages,
      });

      // Redirect to upload page
      await this.sleep(500);
      window.location.href = "https://www.redbubble.com/portfolio/images/new";
      return;
    }

    this.isUploading = true;
    this.currentUpload = { imageFile, formData, currentIndex, totalImages };

    try {
      // Step 1: Upload the image file
      this.sendStatusToPanel(
        `Uploading image ${currentIndex + 1}/${totalImages}...`,
        "info"
      );
      await this.uploadImageFile(imageFile);

      // Step 2: Wait for upload to complete
      this.sendStatusToPanel("Waiting for upload to complete...", "info");
      await this.waitForUploadCompletion();

      // Step 3: Fill form fields
      this.sendStatusToPanel("Filling form fields...", "info");
      await this.fillFormFields(formData);

      // Step 4: Set content options
      this.sendStatusToPanel("Setting content options...", "info");
      await this.setContentOptions();

      // Step 5: Submit the form
      this.sendStatusToPanel("Submitting design...", "info");
      await this.submitForm();

      // Step 6: Wait for redirect and check URL in loop
      this.sendStatusToPanel("Waiting for redirect...", "info");
      await this.waitForRedirect(currentIndex, totalImages);
    } catch (error) {
      console.error("Upload error:", error);
      this.sendStatusToPanel(`Error: ${error.message}`, "error");
      this.isUploading = false;
    }
  }

  async waitForRedirect(currentIndex, totalImages) {
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds max (30 * 2 seconds)

    console.log("Checking for redirect to promote page...");

    while (attempts < maxAttempts) {
      const currentUrl = window.location.href;
      console.log(`Attempt ${attempts + 1}: Current URL:`, currentUrl);

      if (currentUrl.includes("/studio/promote/")) {
        console.log(
          "✓ Redirected to promote page! Navigating back to upload page..."
        );

        this.sendStatusToPanel(
          `Upload ${currentIndex + 1} completed! Loading next image...`,
          "success"
        );

        // Notify panel that upload is complete
        this.sendMessageToPanel({ action: "uploadComplete" });
        this.isUploading = false;

        // Redirect back to upload page for next image
        await this.sleep(1000);
        window.location.href = "https://www.redbubble.com/portfolio/images/new";
        return;
      }

      // Wait 2 seconds before checking again
      await this.sleep(2000);
      attempts++;
    }

    // If timeout, still notify completion
    console.log("Redirect timeout - assuming upload completed");
    this.sendStatusToPanel(`Upload ${currentIndex + 1} completed!`, "success");

    this.sendMessageToPanel({ action: "uploadComplete" });
    this.isUploading = false;
  }

  stopUpload() {
    this.isUploading = false;
    this.currentUpload = null;
  }

  async uploadImageFile(imageFile) {
    return new Promise((resolve, reject) => {
      // Find the file input element - use specific Redbubble ID
      const fileInput = document.getElementById("select-image-single");

      if (!fileInput) {
        // Fallback to generic selector
        const fallbackInput = document.querySelector(
          'input[type="file"][accept*="image"]'
        );
        if (!fallbackInput) {
          reject(new Error("File input not found on page"));
          return;
        }
        console.log("Using fallback file input selector");
      }

      const targetInput =
        fileInput ||
        document.querySelector('input[type="file"][accept*="image"]');

      console.log(`Uploading file: ${imageFile.name}`);

      // Convert base64 to File object
      fetch(imageFile.data)
        .then((res) => res.blob())
        .then((blob) => {
          const file = new File([blob], imageFile.name, {
            type: imageFile.type,
          });

          // Create DataTransfer to set files
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          targetInput.files = dataTransfer.files;

          console.log("File added to input, triggering events...");

          // Trigger events
          targetInput.dispatchEvent(new Event("change", { bubbles: true }));
          targetInput.dispatchEvent(new Event("input", { bubbles: true }));

          console.log("Image file uploaded:", imageFile.name);

          // Wait a bit for the upload to process
          setTimeout(() => resolve(), 2000);
        })
        .catch((error) => reject(error));
    });
  }

  async waitForUploadCompletion() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 120; // 2 minutes max wait
      const checkInterval = 1000; // Check every second

      const checkProgress = setInterval(() => {
        attempts++;

        // Method 1: Check for progress indicator
        const progressElement = document.querySelector("[data-value]");
        if (progressElement) {
          const progressValue = progressElement.getAttribute("data-value");
          const numericValue = parseFloat(progressValue);

          console.log(`Upload progress: ${progressValue}`);

          if (
            progressValue === "1" ||
            progressValue === "1.0" ||
            progressValue === "100" ||
            numericValue >= 1
          ) {
            clearInterval(checkProgress);
            console.log("Upload completed! Waiting for form to be ready...");
            // Wait longer for form to fully load
            setTimeout(() => resolve(), 3000);
            return;
          }
        }

        // Method 2: Check if form fields are visible (indicates upload complete)
        const titleField = document.querySelector(
          'input[name="title"], input[placeholder*="title" i], input[id*="title" i]'
        );
        if (titleField && titleField.offsetParent !== null) {
          clearInterval(checkProgress);
          console.log(
            "Upload completed (form visible)! Waiting for form to be ready..."
          );
          // Wait longer for form to fully load
          setTimeout(() => resolve(), 2000);
          return;
        }

        // Timeout check
        if (attempts >= maxAttempts) {
          clearInterval(checkProgress);
          reject(new Error("Upload timeout - progress not detected"));
        }
      }, checkInterval);
    });
  }

  async fillFormFields(formData) {
    // Wait for form fields to appear after upload
    let titleInput = null;
    let attempts = 0;

    console.log("Looking for form fields...");

    // Try to find title input (wait up to 30 seconds)
    while (!titleInput && attempts < 60) {
      titleInput = document.getElementById("work_title_en");
      if (!titleInput) {
        await this.sleep(500);
        attempts++;
      }
    }

    if (!titleInput) {
      throw new Error("Title input field not found - form may not have loaded");
    }

    this.sendStatusToPanel("Filling in design details...", "info");
    console.log("Form fields found, filling data...");

    // Fill title
    this.setInputValue(titleInput, formData.title);
    await this.sleep(500);
    console.log("Title filled:", formData.title);

    // Fill tags
    if (formData.tags) {
      const tagsInput = document.getElementById("work_tag_field_en");
      if (tagsInput) {
        this.setInputValue(tagsInput, formData.tags);
        await this.sleep(500);
        console.log("Tags filled:", formData.tags);
      } else {
        console.warn("Tags input field not found");
      }
    }

    // Fill description
    if (formData.description) {
      const descInput = document.getElementById("work_description_en");
      if (descInput) {
        this.setInputValue(descInput, formData.description);
        await this.sleep(500);
        console.log("Description filled:", formData.description);
      } else {
        console.warn("Description input field not found");
      }
    }

    // Verify fields were filled
    console.log("Form filled with:", {
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
    this.sendStatusToPanel("Setting content options...", "info");
    console.log("Setting content options...");

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

  async submitForm() {
    this.sendStatusToPanel("Submitting work...", "info");
    console.log("Looking for submit button...");

    const submitButton = document.getElementById("submit-work");

    if (!submitButton) {
      // Debug: Log all buttons
      const allButtons = document.querySelectorAll("button");
      console.log(
        "Submit button not found. All buttons on page:",
        allButtons.length
      );
      allButtons.forEach((btn, i) => {
        console.log(`Button ${i}:`, {
          text: btn.textContent.trim(),
          type: btn.type,
          id: btn.id,
          className: btn.className,
        });
      });
      throw new Error("Submit button not found");
    }

    if (submitButton.disabled) {
      console.error("Submit button is disabled");
      throw new Error("Submit button is disabled - form may be incomplete");
    }

    console.log("Clicking submit button...");
    submitButton.click();
    console.log("Submit button clicked");

    await this.sleep(1000);
  }

  sendStatusToPanel(text, type) {
    // Send through background script to avoid message channel closure
    chrome.runtime
      .sendMessage({
        action: "updateStatus",
        text: text,
        type: type,
      })
      .catch((err) => {
        console.log("Failed to send status to panel:", err);
      });
  }

  sendMessageToPanel(message) {
    // Send through background script to avoid message channel closure
    chrome.runtime.sendMessage(message).catch((err) => {
      console.log("Failed to send message to panel:", err);
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Initialize the automation
new RedbubbleAutomation();
