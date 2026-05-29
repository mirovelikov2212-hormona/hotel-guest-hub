const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const assets = [
  {
    url: "https://magniflex.bg/image/cache/catalog/Magni-Products/Virtuoso%20pillow/Virtuoso1-pillow-small-1260x1260-new-1000x640h.png",
    file: "virtuoso.png",
  },
  {
    url: "https://magniflex.bg/image/cache/catalog/Magni-Products/Abbraccio/Abbraccio-front-3-small-1260x1260-new-1000x640h.png",
    file: "abbraccio.png",
  },
  {
    url: "https://isleep.eu/image/cache/catalog/products/Pillow_Memogel/Memogel-pillow-01-1120x755-2240x1510.jpg",
    file: "memogel.jpg",
  },
];

const targetDir = path.join(process.cwd(), "public", "hotel-assets", "aquamarine", "pillows");
fs.mkdirSync(targetDir, { recursive: true });

function download(url, destination, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, (response) => {
      const status = response.statusCode || 0;

      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location && redirectsLeft > 0) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        return resolve(download(nextUrl, destination, redirectsLeft - 1));
      }

      if (status < 200 || status >= 300) {
        response.resume();
        return reject(new Error(`Download failed (${status}) for ${url}`));
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", (error) => {
        fs.unlink(destination, () => reject(error));
      });
    });

    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy(new Error(`Timeout while downloading ${url}`));
    });
  });
}

(async () => {
  for (const asset of assets) {
    const destination = path.join(targetDir, asset.file);
    console.log(`Downloading ${asset.file}...`);
    await download(asset.url, destination);
    console.log(`Saved: ${path.relative(process.cwd(), destination)}`);
  }

  console.log("Done. Pillow images are ready.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
