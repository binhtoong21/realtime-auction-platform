import 'dotenv/config';
import { generateToken } from '../src/utils/jwt.js';

// Get user ID from command line arguments
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node script/generate-token.js <user-id>');
  process.exit(1);
}

const token = generateToken({ id: userId, role: 'user' });
console.log('--------------------------------------------------');
console.log(`Token cho User ID [${userId}]:\n`);
console.log(token);
console.log('--------------------------------------------------');
console.log('Lưu ý: Dùng token này để set vào mục Bearer Token trong Postman');
