/**
 * Run with: npx playwright install chromium && node scripts/check-edges.mjs
 * Requires dev server: npm run dev (in another terminal)
 * Queries http://localhost:5173 to find why connection lines are not visible.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const MINIMAL_PAGE = 'http://localhost:5173/minimal-flow.html';

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Use minimal-flow page which has 2 nodes and 1 edge by default (no API)
    await page.goto(MINIMAL_PAGE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('.react-flow', { timeout: 5000 }).catch(() => null);
    await page.waitForSelector('.react-flow__node', { timeout: 5000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 800));

    const info = await page.evaluate(() => {
      const root = document.querySelector('#root');
      const reactFlow = document.querySelector('.react-flow');
      const viewport = document.querySelector('.react-flow__viewport, .xyflow__viewport');
      const edgesContainer = document.querySelector('.react-flow__edges');
      const edgePaths = document.querySelectorAll('.react-flow__edge-path');
      const edgeGroups = document.querySelectorAll('.react-flow__edge');
      const markers = document.querySelectorAll('.react-flow__marker marker, .react-flow__arrowhead');
      const firstPath = edgePaths[0];
      let pathInfo = null;
      if (firstPath) {
        const style = window.getComputedStyle(firstPath);
        pathInfo = {
          d: firstPath.getAttribute('d')?.slice(0, 80) + (firstPath.getAttribute('d')?.length > 80 ? '...' : ''),
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
          fill: style.fill,
          visibility: style.visibility,
          display: style.display,
          opacity: style.opacity,
        };
      }
      const nodeCount = document.querySelectorAll('.react-flow__node').length;
      return {
        hasRoot: !!root,
        hasReactFlow: !!reactFlow,
        hasViewport: !!viewport,
        viewportTransform: viewport ? window.getComputedStyle(viewport).transform : null,
        hasEdgesContainer: !!edgesContainer,
        edgesContainerChildren: edgesContainer?.children?.length ?? 0,
        nodeCount,
        edgePathCount: edgePaths.length,
        edgeGroupCount: edgeGroups.length,
        markerCount: markers.length,
        firstPathInfo: pathInfo,
        reactFlowWrapperSize: reactFlow?.getBoundingClientRect?.() ? {
          w: reactFlow.getBoundingClientRect().width,
          h: reactFlow.getBoundingClientRect().height,
        } : null,
      };
    });

    console.log(JSON.stringify(info, null, 2));

    if (info.edgePathCount === 0 && info.edgeGroupCount === 0) {
      console.log('\n→ No edge elements in DOM. Likely no edges in state or edges not rendered (e.g. missing node positions).');
    } else if (info.edgePathCount > 0 && info.firstPathInfo) {
      if (info.firstPathInfo.stroke === 'none' || info.firstPathInfo.strokeWidth === '0px') {
        console.log('\n→ Edge path exists but stroke is none/0 – CSS or inline style is hiding the line.');
      } else {
        console.log('\n→ Edge path exists with stroke. If still not visible, check z-index/overflow/position.');
      }
    }

    await browser.close();
  } catch (err) {
    console.error(err);
    if (browser) await browser.close();
    process.exit(1);
  }
}

main();
