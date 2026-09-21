import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

test("real chart components render candles, empty states and secondary pane controls", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "quant-chart-render-"));
  try {
    const outfile = join(temporary, "render.cjs");
    await build({
      stdin: {
        contents: `
      import React from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import {ChartViewport} from './packages/chart/src/ChartViewport.tsx';
      export const render=(props)=>renderToStaticMarkup(React.createElement(ChartViewport,props));
    `,
        resolveDir: resolve(import.meta.dirname, "../.."),
        loader: "tsx",
      },
      outfile,
      bundle: true,
      platform: "node",
      format: "cjs",
      jsx: "automatic",
    });
    const { render } = await import(pathToFileURL(outfile).href);
    const populated = render({});
    assert.match(populated, /<svg/);
    assert.doesNotMatch(populated, /NaN|Infinity/);
    const empty = render({ candles: [] });
    assert.doesNotMatch(empty, /NaN|Infinity/);
    const pane = render({
      secondaryPane: {
        id: "test",
        name: "Test RSI",
        parameterSummary: "14",
        series: [],
        referenceLines: [],
      },
    });
    assert.match(pane, /role="separator"/);
    assert.match(pane, /Test RSI/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
