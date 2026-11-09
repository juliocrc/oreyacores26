# Invoice Work References

New invoices derive their number exclusively from the persisted `OrdemServico.numeroOrdem`, the canonical work reference maintained by the existing FO synchronization. Billing never looks up the current raft or another inspection and never renames an order.

- Normalize the reference with trim and uppercase. Valid FO format: `^FO(0[1-9]|1[0-2])(\d{2})(\d{5,6})$`, accepting exactly five legacy sequence digits or six sequence digits.
- Convert to `FTMMYYNNNNNN`, preserving month/year order and left-padding the sequence to six digits: `FO102600098` becomes `FT1026000098`; `FO022600020` becomes `FT0226000020`. Six-digit input `FO1026000098` also becomes `FT1026000098`. The invoice emission date does not affect this conversion.
- Five- and six-digit FO representations of the same month/year/sequence derive the same FT number. Existing collision guards apply; they cannot produce two invoices with that number.
- A grouped invoice derives an FT number only if every order has the same normalized valid FO reference. Distinct or missing references use the existing generic `FAT-YYYY-sssss` series. No arbitrary primary work is selected.
- Invalid FO and legacy/non-FO references retain generic numbering, with their work references still captured.
- Existing invoices retain their issued numbers and snapshots, including numbers issued under a previous format. This corrected format applies only to new invoices. Repeating the exact issued composition returns that invoice. Cancelled invoices cannot be reissued, and their numbers cannot be reused. A collision returns HTTP 409, never a suffix or a fallback number.
- Existing database uniqueness and serializable transactions guard concurrent issuance. No schema change is required.

## Renderer Contract

`resumoFatura()` now returns `numeroObra: string | null` and `numerosObra: string[]`. Use `numeroFatura` for the invoice header and `numerosObra` for all work references in the header/body. A null singular value means there is no single work reference; it must not be replaced by the first live order or current raft reference.

Both issuance APIs and `GET /api/faturas` expose the same two fields. The creation response retains `fatura`, `numeroFatura` and `alreadyEmitted`.

Persisted `Fatura.metadados` contains `numeroObra`, sorted/deduplicated `numerosObra`, the existing `numeroOrdens`, and `ordensSnapshot`. Each new order snapshot explicitly freezes `numeroOrdem` and normalized `numeroObra` alongside the existing financial data and metadata. Summary orders overlay these snapshots on the linked orders.

For legacy invoices, `invoiceWorkReferences()` may read the already-issued `numeroOrdens` snapshot. Without such a snapshot it returns no references, rather than inferring history from mutable live data. PDF/Excel rendering is outside this change; consumers should use this contract.
