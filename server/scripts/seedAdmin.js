"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const readline_1 = __importDefault(require("readline"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const uuid_1 = require("uuid");
const db_1 = __importDefault(require("../src/db"));
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
const question = (query) => {
    return new Promise(resolve => rl.question(query, resolve));
};
async function main() {
    console.log('=== KIROPRO Admin Seed ===');
    try {
        const email = await question('Enter Admin Email: ');
        if (!email)
            throw new Error('Email is required');
        const password = await question('Enter Admin Password: ');
        if (!password || password.length < 6)
            throw new Error('Password must be at least 6 characters');
        const name = await question('Enter Admin Name (optional): ');
        const passwordHash = await bcrypt_1.default.hash(password, 10);
        const userId = (0, uuid_1.v4)();
        const walletId = (0, uuid_1.v4)();
        const client = await db_1.default.connect();
        try {
            await client.query('BEGIN');
            const existing = await client.query('SELECT id FROM "User" WHERE email = $1', [email]);
            if (existing.rows.length > 0) {
                throw new Error('User with this email already exists');
            }
            await client.query('INSERT INTO "User" (id, email, name, "passwordHash", role) VALUES ($1, $2, $3, $4, $5)', [userId, email, name || 'Admin', passwordHash, 'ADMIN']);
            await client.query('INSERT INTO "Wallet" (id, "userId", balance) VALUES ($1, $2, $3)', [walletId, userId, 0]);
            await client.query('COMMIT');
            console.log('✅ Admin user created successfully.');
            console.log(`Email: ${email}`);
            console.log('Role: ADMIN');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        console.error('❌ Failed to seed admin:', error.message);
    }
    finally {
        rl.close();
        db_1.default.end();
    }
}
main();
//# sourceMappingURL=seedAdmin.js.map