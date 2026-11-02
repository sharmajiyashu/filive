const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', '..', 'FIVO', 'lib', 'screens', 'profile', 'profile_screen.dart');
let s = fs.readFileSync(p, 'utf8');

if (!s.includes("import '../../core/services/auth_service.dart';")) {
  s = "import '../../core/services/auth_service.dart';\n" + s;
}

s = s.replace(
  'onConfirm: () {',
  'onConfirm: () async {\n        await AuthService().logout();'
);

fs.writeFileSync(p, s, 'utf8');
console.log('profile_screen.dart updated successfully');

