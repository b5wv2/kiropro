import 'dotenv/config';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import fs from 'fs';
import path from 'path';
import { gamesDropClient } from '../src/providers/gamesdrop/client';
import { GamesDropSyncResponse } from '../src/providers/gamesdrop/types';

export interface RawPricingBreakdown {
  rowPrice: number | null;
  rowCurrency: string | null;
  providerPrice: number | null;
  providerCurrency: string | null;
  addedPercent: number | null;
  fxRate: number | null;
  breakdownPrice: number | null;
  breakdownCurrency: string | null;
}

export interface GamesDropTopUpItem {
  providerOfferId: number;
  productId: number | null;
  productName: string;
  offerName: string;
  category: string;

  // Exact raw price fields
  price: number | null;
  currency: string | null;

  priceBreakdown: {
    providerPrice: number | null;
    providerCurrency: string | null;
    addedPercent: number | null;
    fxRate: number | null;
    price: number | null;
    currency: string | null;
    isPriceFresh?: boolean | null;
  } | null;

  rawPricing: RawPricingBreakdown;

  // Platform and region metadata
  platformCode: string | null;
  platformName: string | null;
  regionCode: string | null;
  regionName: string | null;

  // Operational & specification fields
  inStock: boolean;
  isRequiredGameUserId: boolean;
  isRequiredGameServerId: boolean;
  regionalLimitations: string | null;
  excludedCountryCodes: string[];
  sellerOfferCount: number | null;
  productOfferId: number | null;

  // KIROPRO Local State (Default Inactive, null price)
  customerPriceUsd: null;
  isActive: boolean;
  isTestOffer?: boolean;
}

export interface CatalogSnapshot {
  source: string;
  category: string;
  generatedAt: string;
  totalCount: number;
  products: GamesDropTopUpItem[];
}

async function rebuildTopupsFromLiveApi() {
  console.log('================================================================');
  console.log('  KIROPRO — REBUILDING GAMESDROP TOP-UP CATALOG FROM LIVE API');
  console.log('================================================================');

  const limit = 1000;
  let page = 1;
  let expectedTotalCount: number | null = null;
  const rawRows: any[] = [];

  console.log('[Live Sync] Connecting to GamesDrop Partner API endpoint /api/v1/offers/sync ...');

  while (true) {
    console.log(`[Live Sync] Requesting category="Top Up", page=${page}, limit=${limit}...`);

    const response = await gamesDropClient.request<GamesDropSyncResponse>('/api/v1/offers/sync', {
      method: 'POST',
      body: {
        category: 'Top Up',
        limit,
        page
      }
    });

    if (expectedTotalCount === null) {
      expectedTotalCount = typeof response.count === 'number' ? response.count : null;
      console.log(`[Live Sync] GamesDrop reported total count: ${expectedTotalCount}`);
    }

    const rows = response.rows || [];
    console.log(`[Live Sync] Page ${page}: Received ${rows.length} rows.`);

    if (rows.length === 0) {
      break;
    }

    rawRows.push(...rows);

    // Continue pagination until all records are retrieved
    if (expectedTotalCount !== null && rawRows.length >= expectedTotalCount) {
      console.log(`[Live Sync] Downloaded ${rawRows.length} of ${expectedTotalCount} offers.`);
      break;
    }

    if (rows.length < limit) {
      console.log(`[Live Sync] Last page reached with ${rows.length} rows.`);
      break;
    }

    page++;
  }

  console.log('\n================================================================');
  console.log('  PAGINATION VERIFICATION');
  console.log('================================================================');
  console.log(`Expected count: ${expectedTotalCount}`);
  console.log(`Downloaded:     ${rawRows.length}`);

  if (expectedTotalCount !== null && rawRows.length !== expectedTotalCount) {
    console.error(`[FATAL ERROR] Download count mismatch! Expected: ${expectedTotalCount}, Downloaded: ${rawRows.length}`);
    throw new Error(`IMPORT_FAILED: Download count mismatch (${rawRows.length} !== ${expectedTotalCount})`);
  }

  console.log('[Live Sync] Pagination verification PASSED.');

  // Check sample offers 396-400 diagnostic logging
  console.log('\n================================================================');
  console.log('  SAMPLE RAW DIAGNOSTIC SUMMARY (Offers 396–400)');
  console.log('================================================================');
  const targetSampleIds = [396, 397, 398, 399, 400];
  
  for (const sampleId of targetSampleIds) {
    const sampleRow = rawRows.find((r: any) => r.offerGroupId === sampleId || r.offerId === sampleId);
    if (sampleRow) {
      const pb = sampleRow.priceBreakdown;
      console.log(`\n--- Offer ID: ${sampleId} ---`);
      console.log(`productName:                     ${sampleRow.productName}`);
      console.log(`offerName:                       ${sampleRow.offerGroupName || sampleRow.offerName}`);
      console.log(`row.price:                       ${sampleRow.price}`);
      console.log(`row.currency:                    ${sampleRow.currency}`);
      console.log(`priceBreakdown.providerPrice:    ${pb?.providerPrice ?? 'null'}`);
      console.log(`priceBreakdown.providerCurrency: ${pb?.providerCurrency ?? 'null'}`);
      console.log(`priceBreakdown.addedPercent:     ${pb?.addedPercent ?? 'null'}`);
      console.log(`priceBreakdown.fxRate:           ${pb?.fxRate ?? 'null'}`);
      console.log(`priceBreakdown.price:            ${pb?.price ?? 'null'}`);
      console.log(`priceBreakdown.currency:         ${pb?.currency ?? 'null'}`);
    } else {
      console.log(`\n--- Offer ID: ${sampleId} Not found in synced Top Up rows ---`);
    }
  }

  // Duplicate detection by offerGroupId
  console.log('\n================================================================');
  console.log('  DUPLICATE DETECTION (by offerGroupId)');
  console.log('================================================================');
  const seenOfferGroupIds = new Map<number, number>();
  const duplicates: number[] = [];

  for (const row of rawRows) {
    const id = Number(row.offerGroupId !== undefined ? row.offerGroupId : row.offerId);
    if (seenOfferGroupIds.has(id)) {
      duplicates.push(id);
      seenOfferGroupIds.set(id, (seenOfferGroupIds.get(id) || 1) + 1);
    } else {
      seenOfferGroupIds.set(id, 1);
    }
  }

  if (duplicates.length > 0) {
    console.warn(`[Live Sync WARNING] Found ${duplicates.length} duplicate offerGroupId(s):`, duplicates);
  } else {
    console.log('[Live Sync] Zero duplicate offerGroupId found. Catalog keys are 100% unique.');
  }

  // Build clean products preserving exact raw API values
  const products: GamesDropTopUpItem[] = rawRows.map((row: any) => {
    const providerOfferId = Number(row.offerGroupId !== undefined ? row.offerGroupId : row.offerId);
    const pb = row.priceBreakdown;

    const rawPricing: RawPricingBreakdown = {
      rowPrice: row.price !== undefined ? Number(row.price) : null,
      rowCurrency: row.currency || null,
      providerPrice: pb && pb.providerPrice !== undefined ? Number(pb.providerPrice) : null,
      providerCurrency: pb?.providerCurrency || null,
      addedPercent: pb && pb.addedPercent !== undefined ? Number(pb.addedPercent) : null,
      fxRate: pb && pb.fxRate !== undefined ? Number(pb.fxRate) : null,
      breakdownPrice: pb && pb.price !== undefined ? Number(pb.price) : null,
      breakdownCurrency: pb?.currency || null
    };

    return {
      providerOfferId,
      productId: row.productId !== undefined ? Number(row.productId) : null,
      productName: String(row.productName || '').trim(),
      offerName: String(row.offerGroupName || row.offerName || '').trim(),
      category: 'Top Up',

      price: row.price !== undefined ? Number(row.price) : null,
      currency: row.currency || null,

      priceBreakdown: pb ? {
        providerPrice: pb.providerPrice !== undefined ? Number(pb.providerPrice) : null,
        providerCurrency: pb.providerCurrency || null,
        addedPercent: pb.addedPercent !== undefined ? Number(pb.addedPercent) : null,
        fxRate: pb.fxRate !== undefined ? Number(pb.fxRate) : null,
        price: pb.price !== undefined ? Number(pb.price) : null,
        currency: pb.currency || null,
        isPriceFresh: pb.isPriceFresh !== undefined ? Boolean(pb.isPriceFresh) : null
      } : null,

      rawPricing,

      platformCode: row.platformCode || null,
      platformName: row.platformName || null,
      regionCode: row.regionCode || null,
      regionName: row.regionName || null,

      inStock: Boolean(row.inStock),
      isRequiredGameUserId: Boolean(row.isRequiredGameUserId),
      isRequiredGameServerId: Boolean(row.isRequiredGameServerId),
      regionalLimitations: row.regionalLimitations || null,
      excludedCountryCodes: Array.isArray(row.excludedCountryCodes) ? row.excludedCountryCodes : [],
      sellerOfferCount: row.sellerOfferCount !== undefined ? Number(row.sellerOfferCount) : null,
      productOfferId: row.productOfferId !== undefined ? Number(row.productOfferId) : null,

      customerPriceUsd: null,
      isActive: false
    };
  });

  // Ensure Official Test Offer 999 is included and clearly marked
  const hasOffer999 = products.some(p => p.providerOfferId === 999);
  if (!hasOffer999) {
    console.log('\n[Live Sync] Appending Official GamesDrop Test Offer 999 (isTestOffer: true)...');
    products.unshift({
      providerOfferId: 999,
      productId: 999,
      productName: 'Steam US (Test Offer)',
      offerName: 'TEST OFFER GROUP',
      category: 'Top Up',
      price: 24,
      currency: 'KZT',
      priceBreakdown: {
        providerPrice: 24,
        providerCurrency: 'KZT',
        addedPercent: 0,
        fxRate: 1,
        price: 24,
        currency: 'KZT',
        isPriceFresh: true
      },
      rawPricing: {
        rowPrice: 24,
        rowCurrency: 'KZT',
        providerPrice: 24,
        providerCurrency: 'KZT',
        addedPercent: 0,
        fxRate: 1,
        breakdownPrice: 24,
        breakdownCurrency: 'KZT'
      },
      platformCode: 'pc',
      platformName: 'PC Steam',
      regionCode: 'US',
      regionName: 'United States',
      inStock: true,
      isRequiredGameUserId: false,
      isRequiredGameServerId: false,
      regionalLimitations: null,
      excludedCountryCodes: [],
      sellerOfferCount: 1,
      productOfferId: 999,
      customerPriceUsd: null,
      isActive: false,
      isTestOffer: true
    });
  }

  const snapshot: CatalogSnapshot = {
    source: 'GamesDrop Partner API',
    category: 'Top Up',
    generatedAt: new Date().toISOString(),
    totalCount: products.length,
    products
  };

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = path.join(dataDir, 'gamesdrop-topups.json');
  console.log(`\n[Live Sync] Writing snapshot JSON to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf-8');

  const stats = fs.statSync(outputPath);
  console.log('\n================================================================');
  console.log('  CATALOG SNAPSHOT GENERATION COMPLETED');
  console.log('================================================================');
  console.log(`File Path:    ${outputPath}`);
  console.log(`File Size:    ${(stats.size / 1024 / 1024).toFixed(2)} MB (${stats.size.toLocaleString()} bytes)`);
  console.log(`Total Count:  ${products.length}`);
  console.log(`Generated At: ${snapshot.generatedAt}`);
  console.log('================================================================\n');

  return {
    outputPath,
    stats,
    snapshot
  };
}

rebuildTopupsFromLiveApi().catch(err => {
  console.error('[Live Sync FATAL]:', err);
  process.exit(1);
});
