import { ethers } from "ethers";

// رابط RPC مجاني مفتوح بالكامل
const RPC_URL = "https://polygon-bor-rpc.publicnode.com";
const provider = new ethers.JsonRpcProvider(RPC_URL);

const WALLET_ADDRESS = "0x037E3D6FA9d31c2E6227e8b56cF21677A7399a89";
const USDT_CONTRACT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function checkBalances() {
  try {
    console.log(`\nجارٍ فحص المحفظة:\n${WALLET_ADDRESS}\n`);

    // 1. جلب رصيد POL
    const polBalanceWei = await provider.getBalance(WALLET_ADDRESS);
    const polBalance = ethers.formatEther(polBalanceWei);

    // 2. جلب رصيد USDT
    const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, provider);
    const [usdtBalanceRaw, decimals] = await Promise.all([
      usdtContract.balanceOf(WALLET_ADDRESS),
      usdtContract.decimals()
    ]);
    const usdtBalance = ethers.formatUnits(usdtBalanceRaw, decimals);

    // عرض الرصيد في جدول
    console.table([
      { "العملة": "POL (الغاز)", "الرصيد": `${polBalance} POL` },
      { "العملة": "USDT", "الرصيد": `${usdtBalance} USDT` }
    ]);

  } catch (error) {
    console.error("حدث خطأ:", error.message);
  }
}

checkBalances();