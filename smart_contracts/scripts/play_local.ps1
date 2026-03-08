param(
  [string]$RpcUrl = "http://127.0.0.1:8545",
  [string]$PrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
)

$ErrorActionPreference = "Stop"

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  Write-Host "Building contracts..."
  forge build | Out-Null

  Write-Host "Deploying CoalitionGame..."
  $deployOutput = forge create src/CoalitionGame.sol:CoalitionGame --rpc-url $RpcUrl --private-key $PrivateKey
  $match = [regex]::Match($deployOutput, "Deployed to:\s*(0x[a-fA-F0-9]{40})")
  if (-not $match.Success) {
    throw "Could not parse deployed address from cast output: $deployOutput"
  }
  $game = $match.Groups[1].Value
  $player = cast wallet address --private-key $PrivateKey

  Write-Host "CoalitionGame deployed at $game"
  Write-Host "Using controller/player $player"

  cast send $game "createEmpire(string,address,uint256,int256)" "Stellar Federation" $player 500000 40 --rpc-url $RpcUrl --private-key $PrivateKey | Out-Null
  cast send $game "createEmpire(string,address,uint256,int256)" "Verdant Colonies" $player 450000 30 --rpc-url $RpcUrl --private-key $PrivateKey | Out-Null

  cast send $game "createArmy(uint256,string,uint256,uint256,uint256,uint256,uint256)" 1 "Federation Guard" 1200 1200 130 60 200 --rpc-url $RpcUrl --private-key $PrivateKey | Out-Null
  cast send $game "createArmy(uint256,string,uint256,uint256,uint256,uint256,uint256)" 2 "Verdant Wardens" 1150 1150 125 70 180 --rpc-url $RpcUrl --private-key $PrivateKey | Out-Null

  cast send $game "setArmyConsumptionRule(uint8,uint256,uint8,int256,bool)" 0 100 7 5 true --rpc-url $RpcUrl --private-key $PrivateKey | Out-Null
  cast send $game "consumeArmyResource(uint256,uint8,uint256,uint8)" 1 0 260 2 --rpc-url $RpcUrl --private-key $PrivateKey | Out-Null

  cast send $game "resolveBattle(uint256,uint256,uint256)" 1 2 999 --rpc-url $RpcUrl --private-key $PrivateKey | Out-Null
  cast send $game "advanceTurn(uint256)" 15 --rpc-url $RpcUrl --private-key $PrivateKey | Out-Null

  $army1 = cast call $game "getArmy(uint256)((string,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool))" 1 --rpc-url $RpcUrl
  $coalitionReq = cast call $game "coalitionRequisition()(uint256)" --rpc-url $RpcUrl
  $coalitionIntel = cast call $game "coalitionIntel()(uint256)" --rpc-url $RpcUrl

  Write-Host ""
  Write-Host "Sample run complete."
  Write-Host "Army 1 snapshot: $army1"
  Write-Host "Coalition requisition: $coalitionReq"
  Write-Host "Coalition intel: $coalitionIntel"
}
finally {
  Pop-Location
}
