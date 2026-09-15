import fs from 'fs';
import path from 'path';

const jsonPath = path.join(__dirname, '../data/gamesdrop-topups.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const products = data.products || [];

console.log('Total products in JSON:', products.length);

// 1. Free Fire Middle East
const ffMeOffers = products.filter((p: any) => p.productName.toLowerCase().includes('freefire') && p.productName.toLowerCase().includes('middle east'));
console.log(`\n================ FREE FIRE MIDDLE EAST OFFERS (${ffMeOffers.length}) ================`);
ffMeOffers.forEach((p: any) => {
  console.log(`- ID: ${p.providerOfferId} | OfferName: "${p.offerName}" | Price: $${p.price} | Stock: ${p.inStock} | isRequiredGameUserId: ${p.isRequiredGameUserId}`);
});

// 2. PUBG Mobile
const pubgOffers = products.filter((p: any) => p.productName.toLowerCase().includes('pubg mobile'));
console.log(`\n================ PUBG MOBILE OFFERS (${pubgOffers.length}) ================`);
pubgOffers.forEach((p: any) => {
  console.log(`- ID: ${p.providerOfferId} | OfferName: "${p.offerName}" | Price: $${p.price} | Stock: ${p.inStock} | isRequiredGameUserId: ${p.isRequiredGameUserId}`);
});
