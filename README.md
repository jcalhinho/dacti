# DACTI: On-Device AI for Chrome

DACTI is a privacy-first Chrome Extension that brings the power of Gemini AI directly into your browser. It leverages Chrome's built-in AI models to perform a variety of tasks—summarization, translation, proofreading, and more—without your data ever leaving your device. For users who need more power, DACTI offers a seamless fallback to the Gemini Cloud API.

This project was built for the Google Chrome Built-in AI Challenge 2025.

## Features

DACTI offers a suite of AI-powered tools to enhance your browsing experience:

*   **✍️ Summarize:** Get the gist of any webpage in seconds.
*   **🌐 Translate:** Translate selected text into English.
*   **🔍 Proofread:** Correct grammar and spelling in any editable text field.
*   **📝 Write:** Draft emails and other content based on the context of the current page.
*   **🔄 Rewrite:** Rephrase selected text to be more concise and professional.

All features work on-device by default, ensuring your data remains private and accessible even when you're offline.

## How it Works: A Hybrid AI Strategy

DACTI uses a hybrid AI approach to provide a robust and flexible user experience:

1.  **On-Device First:** By default, DACTI uses Chrome's built-in AI (Gemini Nano) to process requests. This is fast, private, and works offline.
2.  **Cloud Fallback:** If the on-device AI is unavailable or the user disables the "On-Device AI" option, DACTI can seamlessly switch to the Gemini Cloud API. This ensures that users always have access to powerful AI features.

Users can configure the cloud fallback to use either a proxy server or their own Gemini API key, giving them full control over their data and API usage.

## Installation and Setup

To get started with DACTI, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/dacti-extension.git
    cd dacti-extension
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Build the extension:**
    ```bash
    pnpm build
    ```

4.  **Load the extension in Chrome:**
    *   Open Chrome and navigate to `chrome://extensions`.
    *   Enable "Developer mode" in the top right corner.
    *   Click "Load unpacked" and select the `dist` directory from this project.

## APIs Used

This extension utilizes the following Chrome Built-in AI APIs:

*   `Summarizer API`
*   `Translator API`
*   `Proofreader API`
*   `Writer API`
*   `Rewriter API`

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
