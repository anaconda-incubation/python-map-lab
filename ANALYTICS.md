# Analytics integration status

Named Heap events are instrumented but collection is **disabled**. No Heap or
Transcend SDK is currently installed. The site remains usable without either.

## Events

| Event | Properties | Trigger |
| --- | --- | --- |
| Projection Selected | projection | Accepted projection selection |
| Experiment Selected | experiment | Experiment tile selection |
| Mode Selected | mode | Learn/experiments navigation |
| Python Run | notebook | Actual run starts, including keyboard shortcut |
| Python Run Completed | notebook, outcome | Run and map rendering succeed, or fail |
| Notebook Download | notebook | Generated notebook download is initiated |
| Map Expanded | view, expanded | Expand/collapse button |
| Outbound Click | destination | External HTTP(S) link click, including middle click |

Names and context are fixed application labels. Code, coordinates, console output,
error messages, and user identity are not sent as custom event properties. External
URLs omit query strings, fragments, and credentials; editor links are excluded.
Download counts measure initiation, not whether the browser saved the file.

## Complete before enabling collection

1. Obtain the production Heap environment ID and approved installation snippet,
   plus the domain's Transcend configuration. Confirm the Heap SDK version and
   data residency; the current vendor installation differs from the classic SDK.
2. Integrate Transcend's approved script and consent UI, including a persistent
   privacy-preferences control. Load Heap only after confirmed Analytics consent.
   Wire withdrawal to stop SDK tracking and handle its queued events/storage using
   the approved SDK APIs and Transcend configuration. Do not rely solely on the
   custom-event guard to stop SDK autocapture.
3. Configure Heap to disable session replay, text capture, and any capture of code,
   coordinates, field values, or sensitive URL parameters. The Python panel has
   redaction attributes as defense in depth; they do not replace SDK configuration.
   Review any automatic events separately from this module's named events.
4. Set `VITE_HEAP_ENABLED=true` in Cloudflare Pages **production** build variables
   only after integration and privacy review, then rebuild. Leave previews disabled.
   The module additionally allows only HTTPS on mapswithpython.com and www.
5. Verify in Heap's event UI: projection/experiment changes; mouse and keyboard
   runs with success/error outcomes; notebook download; map expansion; external
   links. Confirm no duplicate named events and no code or coordinates in payloads.
6. Verify fresh/no-consent, reject, accept, withdraw, reload, and blocked-script
   paths in a browser. Before consent, no Heap script/request should occur.
   Withdrawal must stop automatic and named events; earlier unconsented actions
   must never be replayed. Confirm preview visits do not enter production analytics.

The event module checks Transcend consent on every call, requires confirmed
`Analytics === true`, drops events rather than queueing them, and isolates vendor
failures from the application. It does not independently load the SDK or create
consent policy. Unit tests cover these guards; end-to-end vendor verification is
pending the account configuration above.

References: [Heap installation](https://developers.heap.io/docs/web),
[Heap events](https://developers.heap.io/docs/api-reference),
[Transcend consent API](https://docs.transcend.io/docs/articles/consent-management/testing-and-troubleshooting/faq).
