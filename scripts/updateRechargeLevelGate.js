const fs = require('fs');

const filePath = 'C:/Users/ADMIN/Desktop/projects/xamp/filive-app/lib/Coin/view/coins_balance_screen.dart';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add currentUserLevel variable
if (!content.includes('int currentUserLevel = 1;')) {
  content = content.replace(
    'bool isNormalRecharge = true;',
    'bool isNormalRecharge = true;\r\n  int currentUserLevel = 1;'
  );
}

// 2. Update level parsing in initState
const userDetailsFetchTarget = `        mobile = userDetails?.user.mobile ?? '';\r\n      } catch (_) {}`;
const userDetailsFetchTargetLF = `        mobile = userDetails?.user.mobile ?? '';\n      } catch (_) {}`;

const levelParseCode = `        mobile = userDetails?.user.mobile ?? '';
        final parsedLvl = userDetails?.richLevelInfo?.currentLevel?.levelNumber ??
            userDetails?.levelInfo?.currentLevel?.levelNumber ??
            userDetails?.wealthLevel ??
            userDetails?.level ??
            1;
        if (parsedLvl > 0) {
          currentUserLevel = parsedLvl;
        }
      } catch (_) {}

      if (currentUserLevel <= 1) {
        try {
          final rawUser = await SharedPref.getJson(SharedPref.user);
          final rawLvl = rawUser?['wealthLevel'] ??
              rawUser?['user']?['wealthLevel'] ??
              rawUser?['level'] ??
              rawUser?['user']?['level'] ??
              rawUser?['wealthLevelNumber'] ??
              rawUser?['richLevelInfo']?['currentLevel']?['levelNumber'];
          if (rawLvl is num && rawLvl > 0) {
            currentUserLevel = rawLvl.toInt();
          }
        } catch (_) {}
      }
      if (mounted) {
        setState(() {});
      }`;

if (!content.includes('currentUserLevel = parsedLvl;')) {
  if (content.includes(userDetailsFetchTarget)) {
    content = content.replace(userDetailsFetchTarget, levelParseCode);
  } else if (content.includes(userDetailsFetchTargetLF)) {
    content = content.replace(userDetailsFetchTargetLF, levelParseCode);
  }
}

// 3. Only fetchCoinSellerList if currentUserLevel >= 2 in initState
const fetchSellerTarget = `      controller.fetchCoinSellerList(
        "1",
        "20",
        selectedCountryApi.value.code,
        isInitialLoad: true,
      );`;
const fetchSellerTargetCRLF = `      controller.fetchCoinSellerList(\r\n        "1",\r\n        "20",\r\n        selectedCountryApi.value.code,\r\n        isInitialLoad: true,\r\n      );`;

const gatedFetchSeller = `      if (currentUserLevel >= 2) {
        controller.fetchCoinSellerList(
          "1",
          "20",
          selectedCountryApi.value.code,
          isInitialLoad: true,
        );
      }`;

if (!content.includes('if (currentUserLevel >= 2) {')) {
  if (content.includes(fetchSellerTargetCRLF)) {
    content = content.replace(fetchSellerTargetCRLF, gatedFetchSeller);
  } else if (content.includes(fetchSellerTarget)) {
    content = content.replace(fetchSellerTarget, gatedFetchSeller);
  }
}

// 4. Update body check to ensure Level < 2 strictly shows normal recharge
content = content.replace(
  'if (isNormalRecharge) ...[',
  'if (isNormalRecharge || currentUserLevel < 2) ...['
);

// 5. Update animated position of tab indicator
content = content.replace(
  'left: isNormalRecharge ? 4 : constraints.maxWidth - tabWidth - 4,',
  'left: (isNormalRecharge || currentUserLevel < 2) ? 4 : constraints.maxWidth - tabWidth - 4,'
);

// 6. Update Recharge Service tab tap & locked Lv.2 UI
const oldRechargeServiceTabCRLF = `                  Expanded(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () {
                        setState(() {
                          isNormalRecharge = false;
                        });
                      },
                      child: Center(
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Flexible(
                              child: Text(
                                'Recharge Service',
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontFamily: 'Gilroy',
                                  fontSize: 13,
                                  fontWeight: !isNormalRecharge
                                      ? FontWeight.w700
                                      : FontWeight.w600,
                                  color: !isNormalRecharge
                                      ? Colors.white
                                      : const Color(0xFF333333),
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                                vertical: 1.5,
                              ),
                              decoration: BoxDecoration(
                                color: !isNormalRecharge
                                    ? Colors.white
                                    : const Color(0xFFFF3B30),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.bolt,
                                    color: !isNormalRecharge
                                        ? const Color(0xFFFF3B30)
                                        : Colors.yellow,
                                    size: 9,
                                  ),
                                  Text(
                                    '50%+',
                                    style: TextStyle(
                                      fontFamily: 'Gilroy',
                                      fontSize: 8,
                                      fontWeight: FontWeight.w700,
                                      color: !isNormalRecharge
                                          ? const Color(0xFFFF3B30)
                                          : Colors.white,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),`.replace(/\r?\n/g, '\r\n');

const newRechargeServiceTab = `                  Expanded(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () {
                        if (currentUserLevel < 2) {
                          Fluttertoast.showToast(
                            msg: "Recharge Service unlocks at Level 2. Please reach Level 2 to access!",
                            toastLength: Toast.LENGTH_SHORT,
                            gravity: ToastGravity.BOTTOM,
                            backgroundColor: const Color(0xFF1E0A24),
                            textColor: Colors.white,
                          );
                          return;
                        }
                        setState(() {
                          isNormalRecharge = false;
                        });
                      },
                      child: Center(
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Flexible(
                              child: Text(
                                'Recharge Service',
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontFamily: 'Gilroy',
                                  fontSize: 13,
                                  fontWeight: (!isNormalRecharge && currentUserLevel >= 2)
                                      ? FontWeight.w700
                                      : FontWeight.w600,
                                  color: (!isNormalRecharge && currentUserLevel >= 2)
                                      ? Colors.white
                                      : (currentUserLevel < 2 ? const Color(0xFF888888) : const Color(0xFF333333)),
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            if (currentUserLevel < 2)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 5,
                                  vertical: 1.5,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF8E8E93),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: const [
                                    Icon(
                                      Icons.lock_rounded,
                                      color: Colors.white,
                                      size: 8,
                                    ),
                                    SizedBox(width: 2),
                                    Text(
                                      'Lv.2',
                                      style: TextStyle(
                                        fontFamily: 'Gilroy',
                                        fontSize: 8,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ],
                                ),
                              )
                            else
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                  vertical: 1.5,
                                ),
                                decoration: BoxDecoration(
                                  color: !isNormalRecharge
                                      ? Colors.white
                                      : const Color(0xFFFF3B30),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.bolt,
                                      color: !isNormalRecharge
                                          ? const Color(0xFFFF3B30)
                                          : Colors.yellow,
                                      size: 9,
                                    ),
                                    Text(
                                      '50%+',
                                      style: TextStyle(
                                        fontFamily: 'Gilroy',
                                        fontSize: 8,
                                        fontWeight: FontWeight.w700,
                                        color: !isNormalRecharge
                                            ? const Color(0xFFFF3B30)
                                            : Colors.white,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),`;

// Try CRLF and LF replacement for the tab
if (content.includes(oldRechargeServiceTabCRLF)) {
  content = content.replace(oldRechargeServiceTabCRLF, newRechargeServiceTab);
} else {
  const normContent = content.replace(/\r\n/g, '\n');
  const normTarget = oldRechargeServiceTabCRLF.replace(/\r\n/g, '\n');
  if (normContent.includes(normTarget)) {
    content = normContent.replace(normTarget, newRechargeServiceTab.replace(/\r\n/g, '\n'));
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated coins_balance_screen.dart with Level 2 Policy Gate');
