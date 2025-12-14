import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vehicleConfigs from '../vehicleConfigs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://4x4builder.com';

const generateSitemap = () => {
    const vehicles = vehicleConfigs.vehicles;
    const urls = [
        { loc: '/', changefreq: 'daily', priority: '1.0' },
    ];

    for (const key in vehicles) {
        if (Object.prototype.hasOwnProperty.call(vehicles, key)) {
            const vehicle = vehicles[key];
            if (vehicle.slug) {
                urls.push({
                    loc: `/${vehicle.slug}`,
                    changefreq: 'weekly',
                    priority: '0.8'
                });
            }
        }
    }

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${BASE_URL}${url.loc}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    const outputPath = path.join(__dirname, '../dist/sitemap.xml');
    
    // Ensure dist directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, sitemap);
    console.log(`Sitemap generated at ${outputPath} with ${urls.length} URLs`);
};

generateSitemap();
