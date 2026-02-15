require('dotenv').config();
const { ethers } = require('ethers');
const { OpenSeaSDK, Chain } = require('opensea-js'); // Chain modülünü ekledik

// --- AYARLAR (BASE AĞI) ---
// Base Chain ID: 8453
const PROVIDER = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const MAIN_WALLET = new ethers.Wallet(process.env.MAIN_WALLET_KEY, PROVIDER);

// Bot Cüzdanları
const BOT_WALLETS = [
    new ethers.Wallet(process.env.WALLET_A_KEY, PROVIDER),
    new ethers.Wallet(process.env.WALLET_B_KEY, PROVIDER),
    new ethers.Wallet(process.env.WALLET_C_KEY, PROVIDER)
];

// OpenSea SDK Kurulumu (Base İçin)
const openseaSDK = new OpenSeaSDK(PROVIDER, {
    chain: Chain.Base, // KİLİT NOKTA: Burası Base olarak seçilmeli
    apiKey: process.env.OPENSEA_API_KEY,
});

// Hedef Koleksiyon (Base üzerindeki kontrat adresi ve slug)
const COLLECTION_SLUG = "testmint-750826171"; // Örn: "based-punks"
const COLLECTION_CONTRACT = "0x53d5890ec76462a8ceb7d389ea97a7fe7d2f08db"; // Koleksiyonun Base kontrat adresi

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    console.log("🔵 Base Ağı Botu Başlatılıyor...");
    
    // Ağ kontrolü (Yanlışlıkla mainnet'e bağlanmamak için)
    const network = await PROVIDER.getNetwork();
    if (network.chainId !== 8453) {
        console.error("❌ HATA: RPC URL Base ağına (Chain ID 8453) bağlı değil!");
        return;
    }
    console.log("✅ Base Ağına Bağlanıldı.");

    // DÖNGÜ: Main -> A -> B -> C -> ...
    for (let i = 0; i < BOT_WALLETS.length; i++) {
        const currentWallet = BOT_WALLETS[i];
        const nextWallet = (i + 1 < BOT_WALLETS.length) ? BOT_WALLETS[i + 1] : null;

        console.log(`\n--------------------------------------------`);
        console.log(`➡️  İşlem Sırası: ${currentWallet.address}`);

        try {
            // 1. ADIM: FİYAT VE MALİYET HESABI
            // Not: Base'de gas çok ucuzdur, bu yüzden buffer'ı düşük tutabiliriz.
            
            // Simüle edilmiş NFT Fiyatı (Gerçekte API'den çekilmeli)
            const nftPrice = ethers.utils.parseEther("0.005"); // 0.005 ETH
            
            // Base'de işlem ücretleri genellikle 0.0001 - 0.0005 ETH arasındadır.
            // Güvenlik için 0.001 ETH ayıralım.
            const estimatedGasBuffer = ethers.utils.parseEther("0.001"); 

            const totalNeeded = nftPrice.add(estimatedGasBuffer);

            // 2. ADIM: BAKİYE KONTROLÜ VE FONLAMA
            let balance = await currentWallet.getBalance();
            
            if (balance.lt(totalNeeded)) {
                const missingAmount = totalNeeded.sub(balance);
                console.log(`⚠️ Bakiye yetersiz. Ana cüzdandan ${ethers.utils.formatEther(missingAmount)} ETH (Base) çekiliyor...`);

                // Ana cüzdandan transfer
                const fundTx = await MAIN_WALLET.sendTransaction({
                    to: currentWallet.address,
                    value: missingAmount,
                    // Base EIP-1559 destekler ama legacy de çalışır. Otomatik bırakmak en iyisi.
                });
                console.log(`⏳ Fonlama bekleniyor... Hash: ${fundTx.hash}`);
                await fundTx.wait();
                console.log(`✅ Fonlama tamam.`);
            }

            // 3. ADIM: OPENSEA (SEAPORT) SATIN ALMA
            console.log(`🛒 NFT alma işlemi hazırlanıyor...`);

            /* 
               GERÇEK SENARYO NOTU:
               Burada OpenSea API'sini kullanarak en ucuz listing'in "orderHash"ini bulmanız gerekir.
               Aşağıdaki kod SDK kullanımı için bir şablondur.
            */
            
            // Örnek: SDK ile order'ı fulfill etme (Burayı kendi API mantığına göre açmalısın)
            // const order = await openseaSDK.api.getOrder({ side: "ask", ... });
            // const transaction = await openseaSDK.fulfillOrder({
            //    order,
            //    accountAddress: currentWallet.address,
            // });
            
            await sleep(2000); // Simülasyon beklemesi
            console.log(`✅ (Simülasyon) NFT Alındı.`);


            // 4. ADIM: KALAN PARAYI SÜPÜRME (SWEEP)
            if (nextWallet) {
                const finalBalance = await currentWallet.getBalance();
                
                // Transfer ücretini hesapla (Base'de çok düşüktür)
                const gasPrice = await PROVIDER.getGasPrice();
                const transferGasLimit = ethers.BigNumber.from("21000");
                const transferCost = gasPrice.mul(transferGasLimit);

                // Gönderilecek tutar = Bakiye - Transfer Ücreti
                if (finalBalance.gt(transferCost)) {
                    const amountToSend = finalBalance.sub(transferCost);
                    
                    console.log(`🧹 Kalan ${ethers.utils.formatEther(amountToSend)} ETH sonraki cüzdana aktarılıyor...`);

                    const sweepTx = await currentWallet.sendTransaction({
                        to: nextWallet.address,
                        value: amountToSend,
                        gasLimit: transferGasLimit,
                        gasPrice: gasPrice 
                    });
                    
                    await sweepTx.wait();
                    console.log(`✅ Transfer başarılı: ${nextWallet.address} fonlandı.`);
                } else {
                    console.log(`❌ Transfer edecek kadar bakiye kalmadı.`);
                }
            } else {
                console.log(`🏁 Son cüzdan. Döngü bitti.`);
            }

        } catch (error) {
            console.error(`❌ Hata (${currentWallet.address}):`, error.message);
        }
    }
}

main();