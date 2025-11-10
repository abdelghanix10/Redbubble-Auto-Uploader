chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startUpload") {
    startUploadProcess();
    sendResponse({ success: true });
  }
  return true;
});

async function startUploadProcess() {
  const { queue } = await chrome.storage.local.get("queue");
  if (!queue || queue.length === 0) return;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0].id;

  for (let i = 0; i < queue.length; i++) {
    const design = queue[i];
    if (design.status !== "Queued") continue;

    // Update status to Uploading
    design.status = "Uploading";
    await chrome.storage.local.set({ queue });
    chrome.runtime.sendMessage({ action: "updateQueue", queue });

    // Navigate to upload page
    await chrome.tabs.update(tabId, {
      url: "https://www.redbubble.com/portfolio/images/new",
    });

    // Wait for page load
    await waitForPageLoad(tabId);

    // Upload image
    const fullDataURL = await getImage(design.imageId);
    const imageData = fullDataURL.split(",")[1];
    await chrome.scripting.executeScript({
      target: { tabId },
      func: uploadImage,
      args: [imageData],
    });

    // Wait for upload
    let progress = 0;
    while (progress < 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: getProgress,
      });
      progress = result[0].result;
    }

    // Fill details
    await chrome.scripting.executeScript({
      target: { tabId },
      func: fillDetails,
      args: [design.title, design.tags, design.description],
    });

    // Set options
    await chrome.scripting.executeScript({
      target: { tabId },
      func: setOptions,
    });

    // Submit
    await chrome.scripting.executeScript({
      target: { tabId },
      func: submitWork,
    });

    // Wait for URL change
    let url = "";
    let attempts = 0;
    while (!url.includes("studio/promote") && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const tab = await chrome.tabs.get(tabId);
      url = tab.url;
      attempts++;
    }

    if (url.includes("studio/promote")) {
      // Success
      design.status = "Success";
      design.uploaded = true;
    } else {
      design.status = "Error";
    }

    await chrome.storage.local.set({ queue });
    chrome.runtime.sendMessage({ action: "updateQueue", queue });
  }
}

function uploadImage(imageData) {
  const input = document.querySelector('input[id="select-image-single"]');
  if (!input) return;

  const byteCharacters = atob(imageData);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "image/png" });
  const file = new File([blob], "design.png", { type: "image/png" });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function getProgress() {
  const progress = document.querySelector(".circle-progress");
  return progress ? parseFloat(progress.getAttribute("data-value")) || 0 : 0;
}

function fillDetails(title, tags, description) {
  const titleInput = document.querySelector('input[id="work_title_en"]');
  if (titleInput) titleInput.value = title;

  const tagsInput = document.querySelector('textarea[id="work_tag_field_en"]');
  if (tagsInput) tagsInput.value = tags;

  const descInput = document.querySelector(
    'textarea[id="work_description_en"]'
  );
  if (descInput) descInput.value = description;
}

function setOptions() {
  const safeInput = document.querySelector(
    'input[id="work_safe_for_work_true"]'
  );
  if (safeInput) safeInput.checked = true;

  const rightsInput = document.querySelector('input[id="rightsDeclaration"]');
  if (rightsInput) rightsInput.checked = true;
}

function submitWork() {
  const submitBtn = document.querySelector('input[id="submit-work"]');
  if (submitBtn) submitBtn.click();
}

async function waitForPageLoad(tabId) {
  let loaded = false;
  while (!loaded) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.readyState === "complete",
      });
      loaded = result[0].result;
    } catch (e) {
      // ignore
    }
  }
}

// IndexedDB utilities
const DB_NAME = "RedbubbleUploaderDB";
const STORE_NAME = "images";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getImage(id) {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const request = store.get(id);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
