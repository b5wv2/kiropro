const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/virtualNumberService.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace updateSettings
const oldSettingsMatch = content.match(/public async updateSettings\([\s\S]*?return this\.getSettings\(\);\s*\}/);
if (!oldSettingsMatch) {
  console.error('Could not find updateSettings');
  process.exit(1);
}

const newSettings = `public async updateSettings(params: {
    freeAttemptsLimit?: number | undefined;
    defaultPaidPriceSdg?: number | undefined;
    isSystemActive?: boolean | undefined;
    free_attempts_limit?: number | undefined;
    default_paid_price_sdg?: number | undefined;
    is_system_active?: boolean | undefined;
  }) {
    const freeLimitVal = params.freeAttemptsLimit !== undefined ? params.freeAttemptsLimit : params.free_attempts_limit;
    const defaultPriceVal = params.defaultPaidPriceSdg !== undefined ? params.defaultPaidPriceSdg : params.default_paid_price_sdg;
    const isSystemActiveVal = params.isSystemActive !== undefined ? params.isSystemActive : params.is_system_active;

    const current = await this.getSettings();
    const newFreeLimit = freeLimitVal !== undefined ? Number(freeLimitVal) : current.free_attempts_limit;
    const newPrice = defaultPriceVal !== undefined ? Number(defaultPriceVal) : current.default_paid_price_sdg;
    const newActive = isSystemActiveVal !== undefined ? Boolean(isSystemActiveVal) : current.is_system_active;

    await pool.query(
      \`UPDATE virtual_number_settings 
       SET free_attempts_limit = $1, 
           default_paid_price_sdg = $2, 
           is_system_active = $3, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = 1\`,
      [newFreeLimit, newPrice, newActive]
    );

    return this.getSettings();
  }`;

content = content.replace(oldSettingsMatch[0], newSettings);

// Replace updateProduct
const oldProductMatch = content.match(/public async updateProduct\([\s\S]*?return res\.rows\[0\];\s*\}/);
if (!oldProductMatch) {
  console.error('Could not find updateProduct');
  process.exit(1);
}

const newProduct = `public async updateProduct(id: string, params: {
    customPriceSdg?: number | null | undefined;
    isActive?: boolean | undefined;
    custom_price_sdg?: number | null | undefined;
    is_active?: boolean | undefined;
  }) {
    const customPriceVal = params.customPriceSdg !== undefined ? params.customPriceSdg : params.custom_price_sdg;
    const isActiveVal = params.isActive !== undefined ? params.isActive : params.is_active;

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (customPriceVal !== undefined) {
      updates.push("custom_price_sdg = $" + (idx++));
      values.push(customPriceVal);
    }
    if (isActiveVal !== undefined) {
      updates.push("is_active = $" + (idx++));
      values.push(isActiveVal);
    }

    if (updates.length === 0) {
      const current = await pool.query('SELECT * FROM virtual_number_products WHERE id = $1', [id]);
      return current.rows[0];
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const res = await pool.query(
      "UPDATE virtual_number_products SET " + updates.join(', ') + " WHERE id = $" + idx + " RETURNING *",
      values
    );
    return res.rows[0];
  }`;

content = content.replace(oldProductMatch[0], newProduct);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched virtualNumberService.ts!');
