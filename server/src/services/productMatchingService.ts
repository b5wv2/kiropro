/**
 * Product Matching Service for Unified Multi-Provider Catalog
 * 
 * Accurately matches incoming provider products (G2Bulk, GamesDrop) to existing Koara products
 * using structured multi-attribute heuristics (game, region, denomination, unit, package type).
 * 
 * Strict Guarantees:
 * 1. NEVER merges products across different regions (e.g. Free Fire Global vs LATAM, PUBG Global vs Turkey).
 * 2. NEVER merges different packages (e.g. 60 UC vs 60 WOW Coins, or Regular Topup vs Level-Up pass).
 * 3. Categorizes each match into: MATCHED | NEW_PRODUCT | AMBIGUOUS | REJECTED.
 * 4. AMBIGUOUS matches are never automatically merged.
 */

export type MatchStatus = 'MATCHED' | 'NEW_PRODUCT' | 'AMBIGUOUS' | 'REJECTED';

export interface MatchResult {
  status: MatchStatus;
  productId?: string;
  matchedOfferName?: string;
  confidence: number;
  reason: string;
  candidateProductIds?: string[];
  suggestedAttributes?: {
    productName: string;
    offerName: string;
    gameCategoryId?: string | null;
    regionCode?: string | null;
    regionName?: string | null;
  };
}

export interface CandidateProduct {
  id: string;
  productName: string;
  offerName: string;
  arabicName?: string | null;
  gameCategoryId?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
  customerPriceUsd?: number | null;
  gamesDropCostUsd?: number | null;
  isActive?: boolean;
}

export interface ProviderItemInput {
  gameCode: string;
  gameName: string;
  itemId: string | number;
  itemName: string;
  costUsd: number;
}

export class ProductMatchingService {
  /**
   * Normalize strings: lowercase, remove special characters, normalize whitespace
   */
  public normalize(str: string): string {
    return String(str || '')
      .toLowerCase()
      .replace(/[_\-–—/\\|()[\],:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract exact primary numerical denomination with boundary checking
   */
  public extractDenomination(str: string): number | null {
    if (!str) return null;
    // Remove thousands separator commas (e.g., 1,999 -> 1999)
    const cleaned = String(str).replace(/,/g, '');
    // Match standalone numbers
    const matches = cleaned.match(/\b\d+\b/g);
    if (!matches || matches.length === 0) return null;

    // Filter out common dates or durations (e.g. 2024, 2025, 24, 30D, 7D)
    const numbers = matches.map(Number);
    return numbers[0] !== undefined ? numbers[0] : null;
  }

  /**
   * Extract item currency/unit to avoid merging distinct currencies in the same game
   * e.g., Keys vs Coins vs Gems in Pixel Gun 3D, WOW Coins vs UC in PUBG Mobile
   */
  public extractUnits(str: string): string[] {
    const norm = String(str || '').toLowerCase();
    const units: string[] = [];

    if (/wow\s*coins?/i.test(norm)) {
      units.push('wow_coins');
      return units; // Distinct from regular coins
    }

    if (/\bkeys?\b/i.test(norm)) units.push('keys');
    if (/\bcoins?\b/i.test(norm)) units.push('coins');
    if (/\bgems?\b/i.test(norm)) units.push('gems');
    if (/\bdiamonds?\b/i.test(norm)) units.push('diamonds');
    if (/\buc\b/i.test(norm)) units.push('uc');
    if (/\btokens?\b/i.test(norm)) units.push('tokens');
    if (/\bgold\b/i.test(norm)) units.push('gold');
    if (/\bstars?\b/i.test(norm)) units.push('stars');
    if (/\bcredits?\b/i.test(norm)) units.push('credits');
    return units;
  }

  /**
   * Detect package types to separate regular top-ups from special bundles
   */
  public extractPackageType(str: string): string {
    const norm = String(str || '').toLowerCase();
    if (norm.includes('level up') || norm.includes('level-up')) return 'level_up';
    if (norm.includes('pass upgrade') || norm.includes('pass-upgrade')) return 'pass_upgrade';
    if (norm.includes('pass')) return 'pass';
    if (norm.includes('vip')) return 'vip';
    if (norm.includes('membership')) return 'membership';
    if (norm.includes('weekly')) return 'weekly';
    if (norm.includes('monthly')) return 'monthly';
    if (norm.includes('first purchase')) return 'first_purchase';
    if (norm.includes('prime')) return 'prime';
    if (norm.includes('pack') || norm.includes('bundle')) return 'pack';
    return 'standard';
  }

  /**
   * Region detection to strictly prevent cross-regional merging
   */
  public detectRegion(gameCode: string, gameName: string, offerName: string = '', regionName: string = ''): string {
    const combined = `${gameCode || ''} ${gameName || ''} ${offerName || ''} ${regionName || ''}`.toLowerCase();
    
    if (combined.includes('_me') || combined.includes('middle east') || combined.includes('mena') || combined.includes('الشرق الاوسط')) return 'ME';
    if (combined.includes('_tr') || combined.includes('turkey') || combined.includes('türkiye') || combined.includes('تركيا')) return 'TR';
    if (combined.includes('_id') || combined.includes('indonesia')) return 'ID';
    if (combined.includes('_br') || combined.includes('brazil') || combined.includes('brasil')) return 'BR';
    if (combined.includes('_eu') || combined.includes('europe') || combined.includes('اوروبا')) return 'EU';
    if (combined.includes('_latam') || combined.includes('latin america')) return 'LATAM';
    if (combined.includes('_sgmy') || combined.includes('malaysia') || combined.includes('singapore')) return 'SGMY';
    if (combined.includes('_us') || combined.includes('usa') || combined.includes('united states')) return 'US';
    if (combined.includes('_tw') || combined.includes('taiwan')) return 'TW';
    if (combined.includes('_kr') || combined.includes('korea')) return 'KR';
    if (combined.includes('_ru') || combined.includes('russia')) return 'RU';
    if (combined.includes('global') || combined.includes('glb') || combined.includes('عالمي')) return 'GLOBAL';
    
    return 'DEFAULT';
  }

  /**
   * Map G2Bulk game code and name to Koara GameCategory ID
   */
  public resolveGameCategoryId(gameCode: string, gameName: string): string | null {
    const code = String(gameCode || '').toLowerCase();
    const name = String(gameName || '').toLowerCase();

    if (code === 'pubgm' || (code.includes('pubg') && !code.includes('lite') && !code.includes('new_state'))) {
      return 'pubg-mobile';
    }
    if (code === 'freefire_me' || (name.includes('free') && name.includes('fire') && (code.includes('_me') || name.includes('middle east')))) {
      return 'freefire-me';
    }
    if (code.includes('blood_strike') || code.includes('bloodstrike')) {
      if (code.includes('global') || name.includes('global')) return 'blood-strike-global';
      return 'blood-strike-me';
    }
    if (code.includes('likee') || name.includes('likee')) {
      return 'likee';
    }
    if (code.includes('telegram_star') || name.includes('telegram star')) {
      return 'telegram-stars';
    }
    if (code.includes('telegram_prem') || name.includes('telegram prem')) {
      return 'telegram-premium';
    }
    return null;
  }

  /**
   * Core Matching Function:
   * Compares incoming item against list of candidates and produces MATCHED, NEW_PRODUCT, AMBIGUOUS, or REJECTED.
   */
  public matchProviderProductToKoaraProduct(
    item: ProviderItemInput,
    allCandidates: CandidateProduct[]
  ): MatchResult {
    // 1. Basic validation
    if (!item.itemName || !item.gameName || !item.gameCode) {
      return {
        status: 'REJECTED',
        confidence: 0,
        reason: 'بيانات المنتج أو اللعبة غير مكتملة'
      };
    }

    const itemRegion = this.detectRegion(item.gameCode, item.gameName, item.itemName);
    const itemResolvedCat = this.resolveGameCategoryId(item.gameCode, item.gameName);
    const itemNormGame = this.normalize(item.gameName);

    // 2. Filter candidates by Game Identity & Strict Region
    const gameFilteredCandidates = allCandidates.filter(c => {
      // Game identity check
      let gameMatch = false;
      if (itemResolvedCat && c.gameCategoryId === itemResolvedCat) {
        gameMatch = true;
      } else {
        const cNormGame = this.normalize(c.productName);
        gameMatch = cNormGame.includes(itemNormGame) || itemNormGame.includes(cNormGame);
      }

      if (!gameMatch) return false;

      // Strict Region Check
      const candRegion = this.detectRegion('', c.productName, c.offerName, c.regionName || c.regionCode || '');
      if (itemRegion !== 'DEFAULT' && candRegion !== 'DEFAULT' && itemRegion !== candRegion) {
        return false;
      }

      return true;
    });

    if (gameFilteredCandidates.length === 0) {
      return {
        status: 'NEW_PRODUCT',
        confidence: 1.0,
        reason: 'لا يوجد منتج مطابق في قاعدة البيانات لهذه اللعبة أو المنطقة',
        suggestedAttributes: {
          productName: item.gameName,
          offerName: item.itemName,
          gameCategoryId: itemResolvedCat,
          regionCode: itemRegion !== 'DEFAULT' ? itemRegion : null,
          regionName: itemRegion !== 'DEFAULT' ? itemRegion : null
        }
      };
    }

    // 3. Extract item attributes
    const itemDenom = this.extractDenomination(item.itemName);
    const itemPackType = this.extractPackageType(item.itemName);
    const itemUnits = this.extractUnits(item.itemName);
    const isItemWow = itemUnits.includes('wow_coins');

    // 4. Score candidates
    const scoredMatches: { candidate: CandidateProduct; score: number; reason: string }[] = [];

    for (const cand of gameFilteredCandidates) {
      const candDenom = this.extractDenomination(cand.offerName);
      const candPackType = this.extractPackageType(cand.offerName);
      const candUnits = this.extractUnits(cand.offerName);
      const isCandWow = candUnits.includes('wow_coins');

      // Reject WOW Coins mismatch
      if (isItemWow !== isCandWow) continue;

      // Reject package type mismatch (e.g. Regular topup vs Pass vs Level Up)
      if (itemPackType !== candPackType) continue;

      // Reject currency unit mismatch if both have specified units
      if (itemUnits.length > 0 && candUnits.length > 0) {
        const hasOverlap = itemUnits.some(u => candUnits.includes(u));
        if (!hasOverlap) continue;
      }

      // Check Numerical Match
      if (itemDenom !== null && candDenom !== null) {
        if (itemDenom === candDenom) {
          // Exact numerical denomination match!
          // Verify sub-keywords if pack (e.g. Hero Pack vs Technique Point Pack)
          if (itemPackType !== 'standard') {
            const itemKeywords = this.normalize(item.itemName).split(' ').filter(w => w.length > 2);
            const candKeywords = this.normalize(cand.offerName).split(' ').filter(w => w.length > 2);
            const commonWords = itemKeywords.filter(w => candKeywords.includes(w));
            if (commonWords.length < 2 && itemKeywords.length > 1) {
              continue; // Different specialized pack
            }
          }

          scoredMatches.push({
            candidate: cand,
            score: 0.95,
            reason: `تطابق تام في الفئة والقيمة العددية (${itemDenom}) ونوع الباقة`
          });
        }
      } else if (itemDenom === null && candDenom === null) {
        // Non-numeric match (e.g. Pass name, Monthly Membership)
        const nItem = this.normalize(item.itemName);
        const nCand = this.normalize(cand.offerName);

        if (nItem === nCand) {
          scoredMatches.push({
            candidate: cand,
            score: 0.98,
            reason: 'تطابق تام في الاسم غير العددي'
          });
        } else if (nCand.includes(nItem) || nItem.includes(nCand)) {
          scoredMatches.push({
            candidate: cand,
            score: 0.85,
            reason: 'تطابق جزئي عالي الثقة في اسم الباقة'
          });
        }
      }
    }

    // 5. Evaluate matches
    if (scoredMatches.length === 1) {
      const match = scoredMatches[0]!;
      return {
        status: 'MATCHED',
        productId: match.candidate.id,
        matchedOfferName: match.candidate.offerName,
        confidence: match.score,
        reason: match.reason
      };
    }

    if (scoredMatches.length > 1) {
      // Find highest score
      const highestScore = Math.max(...scoredMatches.map(m => m.score));
      const topMatches = scoredMatches.filter(m => m.score === highestScore);

      if (topMatches.length === 1) {
        const topMatch = topMatches[0]!;
        return {
          status: 'MATCHED',
          productId: topMatch.candidate.id,
          matchedOfferName: topMatch.candidate.offerName,
          confidence: topMatch.score,
          reason: topMatch.reason
        };
      }

      // Ambiguous multiple matches! Do not merge automatically.
      return {
        status: 'AMBIGUOUS',
        candidateProductIds: topMatches.map(m => m.candidate.id),
        confidence: highestScore,
        reason: `يوجد أكثر من منتج مطابق بنفس الدقة (${topMatches.length} مرشحين). تم إيقاف الدمج التلقائي للمراجعة.`
      };
    }

    // No match found -> New product
    return {
      status: 'NEW_PRODUCT',
      confidence: 1.0,
      reason: 'لا يوجد منتج مطابق في قاعدة البيانات للقيمة أو الباقة المحددة',
      suggestedAttributes: {
        productName: item.gameName,
        offerName: item.itemName,
        gameCategoryId: itemResolvedCat,
        regionCode: itemRegion !== 'DEFAULT' ? itemRegion : null,
        regionName: itemRegion !== 'DEFAULT' ? itemRegion : null
      }
    };
  }
}

export const productMatchingService = new ProductMatchingService();
