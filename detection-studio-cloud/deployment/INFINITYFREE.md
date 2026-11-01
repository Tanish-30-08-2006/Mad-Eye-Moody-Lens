# Deploy the static launch website to InfinityFree

This package does not require Node.js or Python on InfinityFree. The site is static HTML/CSS.

1. Open InfinityFree Control Panel → File Manager (or connect over FTP).
2. Open the website document root, normally `htdocs/`.
3. Upload the **contents** of `detection-studio-cloud/website/`.
4. Confirm `index.html` is directly inside `htdocs/` and `assets/styles.css` is inside `htdocs/assets/`.
5. Open your domain and click **Open notebook in Colab**.

The button points to the notebook in the public GitHub `ruturaj-dev` branch. The notebook link only works after the new folder is committed and pushed.

InfinityFree hosts the static information/launch page only. It does not run the local FastAPI backend, Python model code, or Colab GPU jobs.
