document.addEventListener("DOMContentLoaded", async function () {
  const cookieList = document.getElementById("cookieList");
  const messageArea = document.getElementById("messageArea");
  const overallStatus = document.getElementById("overallStatus"); // Get status div
  let apiKey = null;

  // --- Function to get API Key (same as before) ---
  async function getApiKey() {
    try {
      const result = await chrome.storage.sync.get(["geminiApiKey"]);
      return result.geminiApiKey || null;
    } catch (error) {
      console.error("Error retrieving API key:", error);
      return null;
    }
  }

  // --- Function to get explanations for MULTIPLE cookies from Gemini ---
  async function getBatchCookieExplanations(cookiesInfo, apiKey) {
    if (!apiKey) {
      throw new Error("API Key not available."); // Should be checked before calling
    }
    if (!cookiesInfo || cookiesInfo.length === 0) {
      return {}; // No cookies to explain
    }

    overallStatus.textContent = `Requesting explanations for ${cookiesInfo.length} cookies...`;
    overallStatus.style.display = "block";

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

    const promptCookieData = cookiesInfo.map((c) => ({
      name: c.name,
      domain: c.domain,
    }));

    const prompt = `Analyze the following list of web cookies. For each cookie, provide a very short (1 sentence maximum) explanation of its likely purpose based on its name and domain.
IMPORTANT: Respond ONLY with a single JSON object where the keys are the exact cookie names (e.g., "${
      cookiesInfo[0].name
    }") and the values are the corresponding string explanations. Do not include any other text, markdown formatting, or introductory phrases outside the JSON object.

Cookie list:
${JSON.stringify(promptCookieData)}
`;

    console.log("Sending prompt to Gemini:", prompt); // For debugging

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Gemini API Error Response:", errorData);
        throw new Error(
          `API Error ${response.status}: ${
            errorData?.error?.message ||
            response.statusText ||
            "Unknown API error"
          }`
        );
      }

      const data = await response.json();
      console.log("Received response from Gemini:", data);

      const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error("No explanation text received from API.");
      }

      //  parse the text as JSON
      try {
        const cleanJsonString = responseText
          .trim()
          .replace(/^```json\s*/, "")
          .replace(/```$/, "");
        const explanations = JSON.parse(cleanJsonString);
        if (typeof explanations !== "object" || explanations === null) {
          throw new Error("API response was not a valid JSON object.");
        }
        overallStatus.textContent = `Received explanations.`;
        setTimeout(() => {
          overallStatus.style.display = "none";
        }, 2500);
        return explanations;
      } catch (parseError) {
        console.error(
          "Failed to parse JSON response:",
          parseError,
          "\nResponse text:",
          responseText
        );
        throw new Error(
          `Failed to parse explanation JSON: ${parseError.message}`
        );
      }
    } catch (error) {
      console.error("Error fetching batch explanations:", error);
      overallStatus.textContent = `Error: ${error.message}`;
      overallStatus.style.color = "red";
      return null;
    }
  }

  // --- Main Logic ---
  apiKey = await getApiKey();

  if (!apiKey) {
    cookieList.innerHTML = "";
    messageArea.innerHTML = `<div class="api-key-prompt">Gemini API Key not found. Please set it in the <a href="${chrome.runtime.getURL(
      "options.html"
    )}" target="_blank">extension options</a>.</div>`;
    return; // Stop execution if no API key
  } else {
    messageArea.innerHTML = ""; // Clear any previous message
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs.length === 0 || !tabs[0].url) {
      cookieList.innerHTML =
        '<li class="error-message">Could not get current tab URL.</li>';
      return;
    }

    const currentUrl = tabs[0].url;
    let currentDomain = "this site";
    try {
      currentDomain = new URL(currentUrl).hostname;
    } catch (e) {
      /* Keep default */
    }

    if (!currentUrl.startsWith("http:") && !currentUrl.startsWith("https:")) {
      cookieList.innerHTML = `<li class="error-message">Cannot access cookies for this URL scheme.</li>`;
      return;
    }

    chrome.cookies.getAll({ url: currentUrl }, async function (cookies) {
      // Made callback async
      cookieList.innerHTML = ""; // Clear loading message

      if (!cookies || cookies.length === 0) {
        cookieList.innerHTML =
          '<li class="no-cookies">No cookies found for this site.</li>';
        return;
      }

      cookies.sort((a, b) => a.name.localeCompare(b.name));

      const cookiesInfo = []; // Store name/domain for the prompt
      const explanationSpans = {}; // Map cookie name to its explanation span element

      // First Pass: Display cookies and prepare data for API call
      cookies.forEach(function (cookie) {
        cookiesInfo.push({
          name: cookie.name,
          domain: cookie.domain || currentDomain,
        });

        const listItem = document.createElement("li");

        const nameElement = document.createElement("strong");
        nameElement.textContent = escapeHtml(cookie.name);

        const valueElement = document.createElement("span");
        valueElement.className = "cookie-value";
        valueElement.textContent = `: ${escapeHtml(cookie.value)}`; // Keep showing value

        const explanationElement = document.createElement("span");
        explanationElement.className = "explanation loading"; // Placeholder class
        explanationElement.textContent = " "; // Placeholder text
        explanationSpans[cookie.name] = explanationElement; // Store reference to the span

        listItem.appendChild(nameElement);
        listItem.appendChild(valueElement);
        listItem.appendChild(explanationElement);
        cookieList.appendChild(listItem);
      });

      // Second Pass: Make the single API call and update explanations
      const explanations = await getBatchCookieExplanations(
        cookiesInfo,
        apiKey
      );

      // Update UI based on the response
      for (const cookieName in explanationSpans) {
        const span = explanationSpans[cookieName];
        if (explanations && explanations[cookieName]) {
          // Explanation received
          span.textContent = escapeHtml(explanations[cookieName]);
          span.className = "explanation";
        } else if (explanations === null) {
          // API call failed entirely
          span.textContent = "Failed to fetch explanations.";
          span.className = "explanation error";
        } else {
          // Explanation not found in the response object
          span.textContent = "No explanation received for this cookie.";
          span.className = "explanation error";
        }
      }
      // If API call failed before returning anything, update all spans
      if (explanations === null && Object.keys(explanationSpans).length > 0) {
        Object.values(explanationSpans).forEach((span) => {
          span.textContent = overallStatus.textContent; // Show general error
          span.className = "explanation error";
        });
      }
    });
  });
});

// Basic HTML escaping function (same as before)
function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
