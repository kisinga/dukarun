# Read-only bottleneck snapshot for phAMACore Windows hosts.
[CmdletBinding()]
param(
    [ValidateSet('Server', 'Client')]
    [string]$Role = 'Server',

    [Parameter(Mandatory = $true)]
    [string]$SiteName,

    [ValidateRange(1, 180)]
    [int]$DurationMinutes = 20,

    [ValidateRange(2, 60)]
    [int]$SampleIntervalSeconds = 5,

    [string]$ServerIP,
    [string]$SqlInstance,
    [switch]$IperfServer,
    [string]$OutputPath = "$env:USERPROFILE\Desktop\PharmaCoreAudit"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Status {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message"
}

function Export-SafeCsv {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    try {
        $result = & $Command
        if ($null -ne $result) {
            $result | Export-Csv -Path (Join-Path $script:RunPath "$Name.csv") -NoTypeInformation -Encoding UTF8
        }
    }
    catch {
        "${Name}: $($_.Exception.Message)" | Add-Content -Path $script:ErrorLog -Encoding UTF8
    }
}

function Save-SafeText {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    try {
        & $Command 2>&1 | Out-File -FilePath (Join-Path $script:RunPath "$Name.txt") -Encoding UTF8 -Width 240
    }
    catch {
        "${Name}: $($_.Exception.Message)" | Add-Content -Path $script:ErrorLog -Encoding UTF8
    }
}

function Get-Percentile {
    param(
        [object[]]$Values,
        [double]$Percentile
    )

    $numbers = @($Values | ForEach-Object { [double]$_ } | Sort-Object)
    if ($numbers.Count -eq 0) { return $null }
    $index = [Math]::Ceiling($Percentile * $numbers.Count) - 1
    if ($index -lt 0) { $index = 0 }
    return [double]$numbers[$index]
}

function Get-MetricValues {
    param(
        [object[]]$Samples,
        [string]$Pattern
    )

    return @($Samples | Where-Object { $_.Counter -match $Pattern } | Select-Object -ExpandProperty Value)
}

function Add-MetricSummary {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Name,
        [object[]]$Values,
        [double]$Multiplier = 1,
        [string]$Unit = ''
    )

    if (@($Values).Count -eq 0) {
        $Lines.Add("${Name}: unavailable")
        return
    }

    $scaled = @($Values | ForEach-Object { [double]$_ * $Multiplier })
    $average = ($scaled | Measure-Object -Average).Average
    $maximum = ($scaled | Measure-Object -Maximum).Maximum
    $p95 = Get-Percentile -Values $scaled -Percentile 0.95
    $Lines.Add(('{0}: avg={1:N1}{4}, p95={2:N1}{4}, max={3:N1}{4}' -f $Name, $average, $p95, $maximum, $Unit))
}

function Invoke-SqlCsv {
    param(
        [string]$Name,
        [string]$Query
    )

    if ([string]::IsNullOrWhiteSpace($SqlInstance)) { return }

    try {
        $connectionString = "Data Source=$SqlInstance;Initial Catalog=master;Integrated Security=SSPI;Application Name=PharmaCoreAudit;Connect Timeout=5"
        $connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
        $command = $connection.CreateCommand()
        $command.CommandTimeout = 15
        $command.CommandText = $Query
        $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
        $table = New-Object System.Data.DataTable
        [void]$adapter.Fill($table)
        $table | Export-Csv -Path (Join-Path $script:RunPath "$Name.csv") -NoTypeInformation -Encoding UTF8
        $connection.Close()
    }
    catch {
        "${Name}: $($_.Exception.Message)" | Add-Content -Path $script:ErrorLog -Encoding UTF8
    }
}

$safeSiteName = $SiteName -replace '[^a-zA-Z0-9_-]', '_'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$RunPath = Join-Path $OutputPath "${safeSiteName}_${Role}_${env:COMPUTERNAME}_${timestamp}"
$ErrorLog = Join-Path $RunPath 'collection-errors.txt'
New-Item -ItemType Directory -Path $RunPath -Force | Out-Null

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal $identity
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

@(
    "Site=$SiteName"
    "Role=$Role"
    "Computer=$env:COMPUTERNAME"
    "Started=$(Get-Date -Format o)"
    "User=$env:USERNAME"
    "Administrator=$isAdmin"
    "DurationMinutes=$DurationMinutes"
    "SampleIntervalSeconds=$SampleIntervalSeconds"
) | Set-Content -Path (Join-Path $RunPath 'run-info.txt') -Encoding UTF8

if (-not $isAdmin) {
    Write-Warning 'Not running as Administrator. Disk health and some counters may be unavailable.'
}

Write-Status 'Collecting inventory'

Export-SafeCsv 'computer' {
    Get-CimInstance Win32_ComputerSystem |
        Select-Object Manufacturer, Model, Domain, TotalPhysicalMemory, NumberOfProcessors, NumberOfLogicalProcessors
}

Export-SafeCsv 'operating-system' {
    Get-CimInstance Win32_OperatingSystem |
        Select-Object Caption, Version, BuildNumber, OSArchitecture, LastBootUpTime, FreePhysicalMemory, TotalVisibleMemorySize
}

Export-SafeCsv 'cpu' {
    Get-CimInstance Win32_Processor |
        Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, CurrentClockSpeed, LoadPercentage
}

Export-SafeCsv 'memory-modules' {
    Get-CimInstance Win32_PhysicalMemory |
        Select-Object DeviceLocator, Capacity, Speed, ConfiguredClockSpeed, Manufacturer, PartNumber
}

Export-SafeCsv 'disk-drives' {
    Get-CimInstance Win32_DiskDrive |
        Select-Object Model, InterfaceType, MediaType, Size, Status, SerialNumber
}

Export-SafeCsv 'physical-disks' {
    Get-PhysicalDisk |
        Select-Object FriendlyName, SerialNumber, MediaType, BusType, HealthStatus, OperationalStatus, Size, AllocatedSize
}

Export-SafeCsv 'disk-reliability' {
    Get-PhysicalDisk | ForEach-Object {
        $disk = $_
        try {
            $reliability = $disk | Get-StorageReliabilityCounter
            [PSCustomObject]@{
                Disk                   = $disk.FriendlyName
                SerialNumber           = $disk.SerialNumber
                TemperatureC           = $reliability.Temperature
                WearPercent            = $reliability.Wear
                PowerOnHours           = $reliability.PowerOnHours
                ReadErrorsTotal        = $reliability.ReadErrorsTotal
                ReadErrorsUncorrected  = $reliability.ReadErrorsUncorrected
                WriteErrorsTotal       = $reliability.WriteErrorsTotal
                WriteErrorsUncorrected = $reliability.WriteErrorsUncorrected
            }
        }
        catch {
            [PSCustomObject]@{ Disk = $disk.FriendlyName; Error = $_.Exception.Message }
        }
    }
}

Export-SafeCsv 'volumes' {
    Get-Volume |
        Select-Object DriveLetter, FileSystemLabel, FileSystem, HealthStatus, OperationalStatus, Size, SizeRemaining
}

Export-SafeCsv 'network-adapters' {
    Get-NetAdapter |
        Select-Object Name, InterfaceDescription, Status, LinkSpeed, MediaConnectionState, DriverVersion, DriverDate
}

Export-SafeCsv 'network-statistics-before' {
    Get-NetAdapterStatistics |
        Select-Object Name, ReceivedBytes, SentBytes, ReceivedDiscardedPackets, OutboundDiscardedPackets, ReceivedPacketErrors, OutboundPacketErrors
}

Export-SafeCsv 'relevant-services' {
    Get-CimInstance Win32_Service |
        Where-Object { ($_.Name + ' ' + $_.DisplayName + ' ' + $_.PathName) -match 'phama|pharma|corebase|sql|mysql|maria|postgres|oracle|backup|veeam|acronis' } |
        Select-Object Name, DisplayName, State, StartMode, StartName, PathName
}

Export-SafeCsv 'relevant-scheduled-tasks' {
    Get-ScheduledTask | Where-Object {
        ($_.TaskName + ' ' + $_.TaskPath) -match 'backup|sql|scan|defender|sync|update|phama|pharma|corebase'
    } | ForEach-Object {
        $task = $_
        $info = $task | Get-ScheduledTaskInfo
        [PSCustomObject]@{
            TaskName       = $task.TaskName
            TaskPath       = $task.TaskPath
            State          = $task.State
            LastRunTime    = $info.LastRunTime
            LastTaskResult = $info.LastTaskResult
            NextRunTime    = $info.NextRunTime
        }
    }
}

$eventStart = (Get-Date).AddDays(-2)
Export-SafeCsv 'system-errors' {
    Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $eventStart; Level = 1, 2 } -ErrorAction SilentlyContinue |
        Select-Object -First 300 TimeCreated, LevelDisplayName, ProviderName, Id, Message
}

Export-SafeCsv 'application-errors' {
    Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $eventStart; Level = 1, 2 } -ErrorAction SilentlyContinue |
        Select-Object -First 300 TimeCreated, LevelDisplayName, ProviderName, Id, Message
}

Save-SafeText 'ipconfig' { ipconfig.exe /all }
Save-SafeText 'power-plan' { powercfg.exe /getactivescheme }

$iperfPath = $null
$localIperf = Join-Path $PSScriptRoot 'iperf3.exe'
if (Test-Path $localIperf) {
    $iperfPath = $localIperf
}
else {
    $iperfCommand = Get-Command iperf3.exe -ErrorAction SilentlyContinue
    if ($iperfCommand) { $iperfPath = $iperfCommand.Source }
}

$iperfProcess = $null
if ($IperfServer) {
    if ($iperfPath) {
        Write-Status 'Starting temporary iPerf3 server'
        $iperfProcess = Start-Process -FilePath $iperfPath -ArgumentList '-s' -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $RunPath 'iperf-server.txt') `
            -RedirectStandardError (Join-Path $RunPath 'iperf-server-errors.txt')
    }
    else {
        'iperf3.exe not found beside script or in PATH.' | Add-Content -Path $ErrorLog -Encoding UTF8
    }
}

if (-not [string]::IsNullOrWhiteSpace($ServerIP)) {
    Write-Status "Testing network to $ServerIP"
    Save-SafeText 'ping-server' { ping.exe -n 100 $ServerIP }

    if ($iperfPath) {
        Save-SafeText 'iperf-to-server' { & $iperfPath -c $ServerIP -P 4 -t 20 }
        Save-SafeText 'iperf-from-server' { & $iperfPath -c $ServerIP -P 4 -t 20 -R }
    }
    else {
        'iperf3.exe not found; throughput test skipped.' | Add-Content -Path $ErrorLog -Encoding UTF8
    }
}

if (-not [string]::IsNullOrWhiteSpace($SqlInstance)) {
    Write-Status "Collecting read-only SQL Server metrics from $SqlInstance"

    Invoke-SqlCsv 'sql-server-info' @"
SELECT
    @@SERVERNAME AS server_name,
    CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS product_version,
    CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS edition,
    sqlserver_start_time
FROM sys.dm_os_sys_info;
"@

    Invoke-SqlCsv 'sql-active-requests' @"
SELECT
    session_id, status, command, blocking_session_id, wait_type, wait_time,
    total_elapsed_time, cpu_time, logical_reads, reads, writes,
    DB_NAME(database_id) AS database_name
FROM sys.dm_exec_requests
WHERE session_id <> @@SPID;
"@

    Invoke-SqlCsv 'sql-file-latency' @"
SELECT
    DB_NAME(vfs.database_id) AS database_name,
    mf.type_desc,
    mf.name AS logical_name,
    mf.physical_name,
    vfs.num_of_reads,
    CASE WHEN vfs.num_of_reads = 0 THEN 0 ELSE vfs.io_stall_read_ms / vfs.num_of_reads END AS avg_read_ms,
    vfs.num_of_writes,
    CASE WHEN vfs.num_of_writes = 0 THEN 0 ELSE vfs.io_stall_write_ms / vfs.num_of_writes END AS avg_write_ms
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
JOIN sys.master_files mf
  ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id;
"@

    Invoke-SqlCsv 'sql-top-waits' @"
SELECT TOP (20)
    wait_type, waiting_tasks_count, wait_time_ms, signal_wait_time_ms
FROM sys.dm_os_wait_stats
WHERE wait_type NOT LIKE 'SLEEP%'
  AND wait_type NOT IN ('BROKER_EVENTHANDLER','BROKER_RECEIVE_WAITFOR','BROKER_TASK_STOP',
                        'CLR_AUTO_EVENT','CLR_MANUAL_EVENT','LAZYWRITER_SLEEP','SQLTRACE_BUFFER_FLUSH',
                        'XE_DISPATCHER_WAIT','XE_TIMER_EVENT')
ORDER BY wait_time_ms DESC;
"@
}

Write-Status "Recording performance for $DurationMinutes minute(s)"
Write-Host 'Use phAMACore normally now, especially known slow operations.' -ForegroundColor Yellow

$counterPaths = @(
    '\Processor(_Total)\% Processor Time',
    '\System\Processor Queue Length',
    '\Memory\Available MBytes',
    '\Memory\% Committed Bytes In Use',
    '\Memory\Pages Input/sec',
    '\PhysicalDisk(_Total)\Avg. Disk sec/Read',
    '\PhysicalDisk(_Total)\Avg. Disk sec/Write',
    '\PhysicalDisk(_Total)\Disk Transfers/sec',
    '\PhysicalDisk(_Total)\Current Disk Queue Length',
    '\Network Interface(*)\Bytes Total/sec',
    '\Network Interface(*)\Packets Received Errors',
    '\Network Interface(*)\Packets Outbound Errors'
)

$sampleCount = [Math]::Max(1, [Math]::Floor(($DurationMinutes * 60) / $SampleIntervalSeconds))
$performanceSamples = New-Object System.Collections.Generic.List[object]
$performanceStart = Get-Date
$processSnapshotBefore = @(Get-Process -ErrorAction SilentlyContinue |
    Select-Object Name, Id, CPU, WorkingSet64, PrivateMemorySize64)
$processSnapshotBefore | Export-Csv -Path (Join-Path $RunPath 'processes-before.csv') -NoTypeInformation -Encoding UTF8

try {
    Get-Counter -Counter $counterPaths -SampleInterval $SampleIntervalSeconds -MaxSamples $sampleCount -ErrorAction Continue |
        ForEach-Object {
            foreach ($sample in $_.CounterSamples) {
                $row = [PSCustomObject]@{
                    Timestamp = $_.Timestamp.ToString('o')
                    Counter   = $sample.Path.ToLowerInvariant()
                    Value     = [double]$sample.CookedValue
                }
                $performanceSamples.Add($row)
                $row
            }
        } | Export-Csv -Path (Join-Path $RunPath 'performance.csv') -NoTypeInformation -Encoding UTF8
}
catch {
    "performance-counters: $($_.Exception.Message)" | Add-Content -Path $ErrorLog -Encoding UTF8
}

$performanceEnd = Get-Date
$processSnapshotAfter = @(Get-Process -ErrorAction SilentlyContinue |
    Select-Object Name, Id, CPU, WorkingSet64, PrivateMemorySize64)
$processSnapshotAfter | Export-Csv -Path (Join-Path $RunPath 'processes-after.csv') -NoTypeInformation -Encoding UTF8

Export-SafeCsv 'network-statistics-after' {
    Get-NetAdapterStatistics |
        Select-Object Name, ReceivedBytes, SentBytes, ReceivedDiscardedPackets, OutboundDiscardedPackets, ReceivedPacketErrors, OutboundPacketErrors
}

if ($iperfProcess -and -not $iperfProcess.HasExited) {
    Stop-Process -Id $iperfProcess.Id -Force -ErrorAction SilentlyContinue
}

Write-Status 'Building summary'

$summary = New-Object 'System.Collections.Generic.List[string]'
$summary.Add("PHAMACORE PERFORMANCE SNAPSHOT")
$summary.Add("Site: $SiteName")
$summary.Add("Computer: $env:COMPUTERNAME ($Role)")
$summary.Add("Captured: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$summary.Add('')

$cpuValues = Get-MetricValues $performanceSamples '\\processor\(_total\)\\% processor time$'
$queueValues = Get-MetricValues $performanceSamples '\\system\\processor queue length$'
$memoryAvailableValues = Get-MetricValues $performanceSamples '\\memory\\available mbytes$'
$memoryCommittedValues = Get-MetricValues $performanceSamples '\\memory\\% committed bytes in use$'
$pagesInputValues = Get-MetricValues $performanceSamples '\\memory\\pages input/sec$'
$diskReadValues = Get-MetricValues $performanceSamples '\\physicaldisk\(_total\)\\avg\. disk sec/read$'
$diskWriteValues = Get-MetricValues $performanceSamples '\\physicaldisk\(_total\)\\avg\. disk sec/write$'
$diskQueueValues = Get-MetricValues $performanceSamples '\\physicaldisk\(_total\)\\current disk queue length$'

Add-MetricSummary $summary 'CPU' $cpuValues 1 '%'
Add-MetricSummary $summary 'Processor queue' $queueValues
Add-MetricSummary $summary 'Available memory' $memoryAvailableValues 1 ' MB'
Add-MetricSummary $summary 'Committed memory' $memoryCommittedValues 1 '%'
Add-MetricSummary $summary 'Pages input/sec' $pagesInputValues
Add-MetricSummary $summary 'Disk read latency' $diskReadValues 1000 ' ms'
Add-MetricSummary $summary 'Disk write latency' $diskWriteValues 1000 ' ms'
Add-MetricSummary $summary 'Disk queue' $diskQueueValues

$summary.Add('')
$summary.Add('FLAGS')

$flags = New-Object 'System.Collections.Generic.List[string]'
$cpuP95 = Get-Percentile $cpuValues 0.95
$committedMax = if (@($memoryCommittedValues).Count) { ($memoryCommittedValues | Measure-Object -Maximum).Maximum } else { 0 }
$pagesP95 = Get-Percentile $pagesInputValues 0.95
$readP95 = (Get-Percentile $diskReadValues 0.95) * 1000
$writeP95 = (Get-Percentile $diskWriteValues 0.95) * 1000

if ($cpuP95 -ge 85) { $flags.Add('CPU: p95 >= 85%. Correlate with top process or SQL workload.') }
if (($committedMax -ge 90) -and ($pagesP95 -ge 10)) { $flags.Add('Memory: high commitment plus paging. RAM pressure likely.') }
if (($readP95 -ge 20) -or ($writeP95 -ge 20)) { $flags.Add('Storage: p95 latency >= 20 ms. Strong bottleneck candidate.') }
elseif (($readP95 -ge 10) -or ($writeP95 -ge 10)) { $flags.Add('Storage: p95 latency >= 10 ms. Investigate if SSD or aligned with slow actions.') }

try {
    $lowVolumes = Get-Volume | Where-Object { $_.Size -gt 0 -and ($_.SizeRemaining / $_.Size) -lt 0.20 }
    foreach ($volume in $lowVolumes) {
        $flags.Add("Disk space: $($volume.DriveLetter): below 20% free.")
    }
}
catch { }

try {
    $unhealthyDisks = Get-PhysicalDisk | Where-Object { $_.HealthStatus -ne 'Healthy' }
    foreach ($disk in $unhealthyDisks) {
        $flags.Add("Disk health: $($disk.FriendlyName) reports $($disk.HealthStatus).")
    }
}
catch { }

try {
    $slowAdapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.LinkSpeed -match '^(10|100) Mbps$' }
    foreach ($adapter in $slowAdapters) {
        $flags.Add("Network: $($adapter.Name) negotiated at $($adapter.LinkSpeed).")
    }
}
catch { }

if ($flags.Count -eq 0) {
    $summary.Add('No obvious OS-level saturation found during capture. Check database/application timings.')
}
else {
    foreach ($flag in $flags) { $summary.Add("- $flag") }
}

$summary.Add('')
$summary.Add('TOP PROCESSES BY AVERAGE CPU SHARE')

$logicalCpuCount = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
if (-not $logicalCpuCount) { $logicalCpuCount = 1 }

$elapsedSeconds = [Math]::Max(1, ($performanceEnd - $performanceStart).TotalSeconds)
$topProcesses = foreach ($after in $processSnapshotAfter) {
    $before = $processSnapshotBefore | Where-Object { $_.Id -eq $after.Id } | Select-Object -First 1
    if ($before -and $null -ne $after.CPU -and $null -ne $before.CPU) {
        $cpuDelta = [double]$after.CPU - [double]$before.CPU
        if ($cpuDelta -ge 0) {
            [PSCustomObject]@{
                Process = $after.Name
                AverageCpuPercent = ($cpuDelta / $elapsedSeconds / $logicalCpuCount) * 100
            }
        }
    }
}
$topProcesses = $topProcesses | Sort-Object AverageCpuPercent -Descending | Select-Object -First 10

foreach ($process in $topProcesses) {
    $summary.Add(('- {0}: {1:N1}%' -f $process.Process, $process.AverageCpuPercent))
}

$summary | Set-Content -Path (Join-Path $RunPath 'SUMMARY.txt') -Encoding UTF8

if (Test-Path $ErrorLog) {
    $emptyErrors = (Get-Item $ErrorLog).Length -eq 0
    if ($emptyErrors) { Remove-Item $ErrorLog -Force }
}

$zipPath = "$RunPath.zip"
try {
    Compress-Archive -Path (Join-Path $RunPath '*') -DestinationPath $zipPath -CompressionLevel Optimal
    Write-Status "Complete: $zipPath"
}
catch {
    Write-Warning "Collection complete, but ZIP creation failed: $($_.Exception.Message)"
    Write-Status "Results: $RunPath"
}
