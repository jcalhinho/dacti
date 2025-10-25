import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    extension_path = os.path.join(os.getcwd(), 'dist')
    user_data_dir = '/tmp/test-user-data-dir'

    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            args=[
                f'--disable-extensions-except={extension_path}',
                f'--load-extension={extension_path}',
            ]
        )

        # You might need to figure out the extension's ID to open its popup.
        # This is often tricky. An alternative is to open a new page
        # and manually open the extension popup to take a screenshot.

        page = await browser.new_page()
        await page.goto('https://example.com')

        # Give you a moment to manually open the popup
        await asyncio.sleep(5)

        screenshot_path = 'jules-scratch/verification/verification.png'
        await page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        await browser.close()

if __name__ == '__main__':
    os.makedirs('jules-scratch/verification', exist_ok=True)
    asyncio.run(main())
