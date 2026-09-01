# phAMACore audit collector

Focused on high-confidence bottleneck evidence; not full infrastructure monitoring.

Small, read-only Windows PowerShell collector. Run during busy usage and make staff repeat known slow phAMACore actions.

## Server

Run PowerShell as Administrator:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\Collect-PharmaCoreAudit.ps1 `
  -Role Server -SiteName "Site-A" -DurationMinutes 30
```

For SQL Server metrics, add the instance name:

```powershell
  -SqlInstance "localhost\SQLEXPRESS"
```

This uses current Windows credentials and performs read-only queries. Missing SQL permissions are logged and do not stop collection.

## Client

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\Collect-PharmaCoreAudit.ps1 `
  -Role Client -SiteName "Site-A" -ServerIP "192.168.1.10" -DurationMinutes 15
```

For throughput tests, place `iperf3.exe` beside the script. Start server collection with `-IperfServer`, then run client collection. No firewall rules are changed automatically.

## Output

Results go to `Desktop\PharmaCoreAudit`:

- `SUMMARY.txt`: important metrics and flags.
- `performance.csv`: raw time-series evidence.
- Inventory, disk health, network, process, service, task, and error CSVs.
- Optional SQL Server and iPerf results.
- Timestamped ZIP for analysis.

No phAMACore records or database table contents are queried. Review Windows event messages before sharing externally.
