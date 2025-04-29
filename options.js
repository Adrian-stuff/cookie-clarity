const apiKeyInput = document.getElementById("apiKey");
const saveButton = document.getElementById("saveButton");
const statusDiv = document.getElementById("status");

// Load saved API key when options page opens
function restoreOptions() {
  chrome.storage.sync.get(["geminiApiKey"], function (result) {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });
}

// Save API key
function saveOptions() {
  const apiKey = apiKeyInput.value;
  if (!apiKey) {
    statusDiv.textContent = "Error: API Key cannot be empty.";
    statusDiv.style.color = "red";
    return;
  }
  chrome.storage.sync.set({ geminiApiKey: apiKey }, function () {
    // Update status to let user know options were saved.
    statusDiv.textContent = "API Key saved.";
    statusDiv.style.color = "green";
    setTimeout(() => {
      statusDiv.textContent = "";
    }, 2000);
  });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
saveButton.addEventListener("click", saveOptions);
