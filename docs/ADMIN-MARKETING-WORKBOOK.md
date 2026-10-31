# Marketing Excel workbook

`content/admin/Endless-Tales-6-plus-2-Marketing-Workbook.xlsx` groups the published 6+2-week Meta campaign plan into six Excel tabs:

- Budget: the published weekly plan and headline targets. Rounded paid weekly cells total 136 while the source headline is 135; both are retained. Weekly views total 285,714, with approximately 286,000 headline views. Period CAC is not a sum of weekly CAC.
- Actual Results: blank numeric inputs, source references and a Verified Yes/No field. Cost per trial and cumulative CAC calculate from qualified inputs. A numeric zero is distinct from a blank.
- Actual vs Budget: matching weekly budget and evidenced/verified actuals, signed difference and percent variance. Missing targets and zero denominators remain unavailable.
- Variance Analysis: linked comparisons plus editable causes, corrective actions, owner and next-review date.
- Decision Rules: all six Strategos thresholds and standing rules, retaining the source's awaiting-approval status. This file executes no ad controls or trial email schedule.
- Cash: planned funding separate from actual opening cash/deposits, Meta card charges and other cash outflows. Verified closing cash and ad budget remaining calculate from entered data. This executes no bank transfer.

The source is https://claude.ai/artifact/GgPuEUCcaDWSeun2uivPeJ, identified by the owner as the final October 29 workbook. The public artifact disables native XLSX download; this grouped file was authored from the visible source, preserving its displayed values and caveats. Source data is also recorded in `lib/admin-center/meta-test-plan.ts`.

## Access and packaging

Marketing's banner and the 6+2-week plan both link to `/api/admin/center/marketing-workbook`. The route verifies Admin access before reading the fixed packaged path, ignores any requested file path, and responds with XLSX MIME, attachment filename, nosniff and private/no-store caching. The Next configuration explicitly traces the workbook into the route's deployment files. No new runtime spreadsheet dependency is required.

The download is a file copy. Excel edits are not synchronized back to Admin. Downloads start with blank actuals and cash inputs; the server does not manufacture financial actuals.

## Development rebuild and checks

`scripts/admin-center/build-marketing-workbook.mjs` is a development authoring tool using the Codex primary runtime's `@oai/artifact-tool`, not a production build dependency. Export the current plan constants to JSON using existing TypeScript tooling, and set `META_WORKBOOK_SOURCE_JSON` to its absolute path. In an isolated temporary working directory with a `node_modules` link to `CODEX_PRIMARY_RUNTIME_NODE_MODULES`, run the builder using `CODEX_PRIMARY_RUNTIME_NODE`. Set `META_WORKBOOK_OUTPUT_DIR` and `META_WORKBOOK_QA_DIR` to temporary/output folders. Follow the Spreadsheets skill's creation/edit marker and required verification before regeneration. Copy the verified XLSX into `content/admin/` only after its formulas and visual checks pass.

Creation verification included:

- All six worksheets rendered and visually reviewed; dates, currency, counts, frozen headers/identifiers and input cues verified.
- Formula error scan found zero spreadsheet errors.
- Temporary input tests proved variance and cash recalculation, missing actuals, verified zero spend, zero denominators, verification refusal and two-week cash roll-forward. Test inputs were cleared before export.
- Exported ZIP/XML inspection verified six sheets, native formulas, data validation, frozen panes, blank actual/cash inputs and no macros/external workbook links.
- Server tests verify denied access, correct private XLSX response, fixed path and unavailable-asset handling.
- Isolated iPhone/iPad/Mac browser tests click the download and compare its bytes/filename to the packaged workbook.

Microsoft Excel itself was not available for native app testing. The file uses standard Excel formulas and formats. Live authenticated deployment acceptance remains separate from these local checks. Orion remains the only production EC2 deployer.
