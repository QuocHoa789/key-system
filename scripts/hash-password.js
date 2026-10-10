import bcrypt from 'bcrypt';
const password = process.argv[2];
if (!password || password.length < 12) { console.error('Usage: npm run hash-password -- "password-12+"'); process.exit(1); }
console.log(await bcrypt.hash(password, 12));
