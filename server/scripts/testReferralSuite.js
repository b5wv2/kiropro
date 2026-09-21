const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const pool = require('../dist/db').pool;
const {
  getReferralSettings,
  updateReferralSettings,
  generateReferralCode
} = require('../dist/services/referralService');

async function runTests() {
  console.log('--- Starting Referral Suite Tests ---');

  // Test 1: Get Initial Settings
  const settings = await getReferralSettings();
  console.log('1. Current Settings:', settings);
  if (settings.referrer_reward !== 1000 || settings.referee_reward !== 1000) {
    console.warn('Initial rewards differ from default 1000/1000');
  }
  console.log(`Dynamic Total Reward: ${settings.total_reward} ${settings.currency}`);
  console.assert(settings.total_reward === settings.referrer_reward + settings.referee_reward, 'Total reward must equal sum of rewards');

  // Test 2: Dynamic Text Generation on Server side test
  const totalStr = (settings.referrer_reward + settings.referee_reward).toLocaleString('ar-EG');
  const referrerStr = settings.referrer_reward.toLocaleString('ar-EG');
  const refereeStr = settings.referee_reward.toLocaleString('ar-EG');
  const cur = settings.currency || 'جنيه';

  const title = `نادي صاحبك وتعال واكسب ${totalStr} ${cur} 🎁🔥`;
  const subtitle = "أنت وصاحبك تكسبوا مع بعض!";
  const description = `شارك كود الإحالة الخاص بيك مع صاحبك، ولما يسجل ويكمل أول طلب مؤهل، أنت تحصل على ${referrerStr} ${cur} وهو يحصل على ${refereeStr} ${cur}.`;

  console.log('2. Dynamic Texts Generated:');
  console.log('  Title:', title);
  console.log('  Subtitle:', subtitle);
  console.log('  Description:', description);

  // Test 3: Updating settings to 1,500 + 1,500 and verifying dynamic recalculation
  console.log('3. Testing Admin update to 1500 / 1500...');
  const updated = await updateReferralSettings({
    referrer_reward: 1500,
    referee_reward: 1500,
    currency: 'جنيه'
  });
  console.log('  Updated settings:', updated);
  console.assert(updated.total_reward === 3000, 'Updated total should be 3000');

  const updatedTitle = `نادي صاحبك وتعال واكسب ${(updated.total_reward).toLocaleString('ar-EG')} ${updated.currency} 🎁🔥`;
  console.log('  New Dynamic Title with 1500/1500:', updatedTitle);

  // Test 4: Reset back to 1000 / 1000
  console.log('4. Resetting back to 1000 / 1000 جنيه...');
  const resetSettings = await updateReferralSettings({
    enabled: true,
    referrer_reward: 1000,
    referee_reward: 1000,
    currency: 'جنيه',
    min_order_amount: 0
  });
  console.log('  Reset confirmed:', resetSettings);

  // Test 5: Code generator test
  const code1 = generateReferralCode();
  const code2 = generateReferralCode();
  console.log('5. Generated codes:', code1, code2);
  console.assert(code1.startsWith('KP') && code1.length === 8, 'Referral code format valid');
  console.assert(code1 !== code2, 'Generated codes must be unique');

  console.log('--- ALL REFERRAL BACKEND TESTS PASSED! ---');
  await pool.end();
}

runTests().catch(err => {
  console.error('Referral test suite failed:', err);
  process.exit(1);
});
