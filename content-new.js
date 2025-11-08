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

  init() {
    // Listen for messages from side panel
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    console.log("Redbubble Auto Uploader: Content script loaded");
  }

  async handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case "startUpload":
        await this.startUpload(
          message.imageFile,
          message.formData,
          message.currentIndex,
          message.totalImages
        );
        sendResponse({ success: true });
        break;
      case "stopUpload":
        this.stopUpload();
        sendResponse({ success: true });
        break;
    }
  }

  async startUpload(imageFile, formData, currentIndex, totalImages) {
    if (this.isUploading) {
      console.log("Upload already in progress");
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

      // Step 6: Wait for redirect and notify panel
      this.sendStatusToPanel(
        `Upload ${currentIndex + 1} completed!`,
        "success"
      );

      // Wait a bit for page to redirect
      setTimeout(() => {
        this.sendMessageToPanel({ action: "uploadComplete" });
        this.isUploading = false;
      }, 2000);
    } catch (error) {
      console.error("Upload error:", error);
      this.sendStatusToPanel(`Error: ${error.message}`, "error");
      this.isUploading = false;
    }
  }

  stopUpload() {
    this.isUploading = false;
    this.currentUpload = null;
  }

  async uploadImageFile(imageFile) {
    return new Promise((resolve, reject) => {
      // Find the file input element
      const fileInput = document.querySelector(
        'input[type="file"][accept*="image"]'
      );

      if (!fileInput) {
        reject(new Error("File input not found on page"));
        return;
      }

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
          fileInput.files = dataTransfer.files;

          // Trigger events
          fileInput.dispatchEvent(new Event("change", { bubbles: true }));
          fileInput.dispatchEvent(new Event("input", { bubbles: true }));

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
            console.log("Upload completed!");
            setTimeout(() => resolve(), 1000);
            return;
          }
        }

        // Method 2: Check if form fields are visible (indicates upload complete)
        const titleField = document.querySelector(
          'input[name="title"], input[placeholder*="title" i]'
        );
        if (titleField && titleField.offsetParent !== null) {
          clearInterval(checkProgress);
          console.log("Upload completed (form visible)!");
          setTimeout(() => resolve(), 1000);
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
    return new Promise(async (resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 30;

      const tryFill = async () => {
        attempts++;

        // Find title field
        const titleField = document.querySelector(
          'input[name="title"], input[placeholder*="title" i], #work_title'
        );

        // Find tags field
        const tagsField = document.querySelector(
          'input[name="tags"], input[placeholder*="tag" i], textarea[name="tags"]'
        );

        // Find description field
        const descField = document.querySelector(
          'textarea[name="description"], textarea[placeholder*="description" i], #work_description'
        );

        if (titleField) {
          // Fill title
          if (formData.title) {
            await this.setInputValue(titleField, formData.title);
            console.log("Title filled:", formData.title);
          }

          // Fill tags
          if (tagsField && formData.tags) {
            await this.setInputValue(tagsField, formData.tags);
            console.log("Tags filled:", formData.tags);
          }

          // Fill description
          if (descField && formData.description) {
            await this.setInputValue(descField, formData.description);
            console.log("Description filled:", formData.description);
          }

          setTimeout(() => resolve(), 1000);
          return;
        }

        if (attempts >= maxAttempts) {
          reject(new Error("Form fields not found"));
          return;
        }

        setTimeout(tryFill, 500);
      };

      tryFill();
    });
  }

  async setInputValue(element, value) {
    return new Promise((resolve) => {
      // Clear existing value
      element.value = "";
      element.dispatchEvent(new Event("input", { bubbles: true }));

      // Set new value
      element.value = value;

      // Trigger all necessary events
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));

      // Focus and blur to ensure validation
      element.focus();
      setTimeout(() => {
        element.blur();
        resolve();
      }, 100);
    });
  }

  async setContentOptions() {
    return new Promise((resolve) => {
      // Find and click "Safe for work" option
      const safeForWorkLabel = Array.from(
        document.querySelectorAll("label")
      ).find((label) => label.textContent.includes("Safe for work"));

      if (safeForWorkLabel) {
        const radio = safeForWorkLabel.querySelector('input[type="radio"]');
        if (radio && !radio.checked) {
          radio.click();
          console.log('Set to "Safe for work"');
        }
      }

      // Find and check "I own the rights" checkbox
      const rightsCheckbox = Array.from(
        document.querySelectorAll("label")
      ).find(
        (label) =>
          label.textContent.includes("I own the rights") ||
          label.textContent.includes("own the copyright")
      );

      if (rightsCheckbox) {
        const checkbox = rightsCheckbox.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) {
          checkbox.click();
          console.log('Checked "I own the rights"');
        }
      }

      setTimeout(() => resolve(), 500);
    });
  }

  async submitForm() {
    return new Promise((resolve, reject) => {
      // Find the submit button
      const submitButton = Array.from(document.querySelectorAll("button")).find(
        (btn) =>
          btn.textContent.includes("Save work") ||
          btn.textContent.includes("Submit") ||
          btn.textContent.includes("Upload")
      );

      if (submitButton) {
        submitButton.click();
        console.log("Form submitted");
        setTimeout(() => resolve(), 1000);
      } else {
        reject(new Error("Submit button not found"));
      }
    });
  }

  sendStatusToPanel(text, type) {
    this.sendMessageToPanel({
      action: "updateStatus",
      text: text,
      type: type,
    });
  }

  sendMessageToPanel(message) {
    chrome.runtime.sendMessage(message).catch((err) => {
      console.log("Failed to send message to panel:", err);
    });
  }
}

// Initialize the automation
new RedbubbleAutomation();
