const fs = require('fs');
const path = require('path');

// 1. auth_service.dart
const authPath = path.join(__dirname, '..', '..', 'FIVO', 'lib', 'core', 'services', 'auth_service.dart');
let authContent = fs.readFileSync(authPath, 'utf8');
authContent = authContent.replace("if (gender != null) 'gender': gender,", "if (gender != null && gender.isNotEmpty) 'gender': gender,");
authContent = authContent.replace("if (dob != null) 'dob': dob,", "if (dob != null && dob.isNotEmpty) 'dob': dob,");
fs.writeFileSync(authPath, authContent, 'utf8');

// 2. splash_screen.dart
const splashPath = path.join(__dirname, '..', '..', 'FIVO', 'lib', 'screens', 'splash', 'splash_screen.dart');
let splashContent = fs.readFileSync(splashPath, 'utf8');
splashContent = splashContent.replace(/pageBuilder: \(_, animation, __\)/g, "pageBuilder: (context, animation, secondaryAnimation)");
splashContent = splashContent.replace(/transitionsBuilder: \(_, animation, __, child\)/g, "transitionsBuilder: (context, animation, secondaryAnimation, child)");
fs.writeFileSync(splashPath, splashContent, 'utf8');

// 3. profile_screen.dart
const profilePath = path.join(__dirname, '..', '..', 'FIVO', 'lib', 'screens', 'profile', 'profile_screen.dart');
let profileContent = fs.readFileSync(profilePath, 'utf8');
const oldLogout = `  void _handleLogout() {
    ProfileActionSheets.showLogoutDialog(
      context,
      onConfirm: () async {
        await AuthService().logout();
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const WelcomeScreen()),
          (route) => false,
        );
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Logged out successfully'),
            backgroundColor: AppColors.textPrimary,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      },
    );
  }`;

const newLogout = `  void _handleLogout() {
    ProfileActionSheets.showLogoutDialog(
      context,
      onConfirm: () async {
        await AuthService().logout();
        if (!mounted) return;
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const WelcomeScreen()),
          (route) => false,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Logged out successfully'),
            backgroundColor: AppColors.textPrimary,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
      },
    );
  }`;

profileContent = profileContent.replace(oldLogout, newLogout);
fs.writeFileSync(profilePath, profileContent, 'utf8');

console.log('Fixed lints successfully');

