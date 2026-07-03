param(
  [Parameter(Mandatory = $true)]
  [string]$InstanceUrl,

  [string]$Alias = "docsera-pdi",

  [string]$Username = "admin"
)

$ErrorActionPreference = "Stop"

$securePassword = Read-Host -Prompt "ServiceNow password for $Username at $InstanceUrl" -AsSecureString
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)

  $plainPassword |
    npx @servicenow/sdk auth --add $InstanceUrl --type basic --alias $Alias --username $Username --password-stdin

  npx @servicenow/sdk auth --list

  Write-Host ""
  Write-Host "Next commands:"
  Write-Host "  npx @servicenow/sdk transform --auth $Alias"
  Write-Host "  npx @servicenow/sdk install --auth $Alias"
}
finally {
  if ($passwordPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
  }
}
