const fs = require('fs');

const filePath = 'C:/Users/ADMIN/Desktop/projects/xamp/filive-app/lib/My Profile/View/CoinSeller/View/recharge.dart';
let content = fs.readFileSync(filePath, 'utf8');

// Ensure CoinPackage import is present if needed
if (!content.includes('coin_screen_model.dart')) {
  content = `import 'package:filive/Coin/Model/coin_screen_model.dart';\r\n` + content;
}

// Replace the old GridView.builder and amountCard with the beautiful normal recharge design
const oldGridStartMarker = '/// AMOUNT GRID';
const oldGridEndMarker = '/// BUTTON';

const newGridCode = `/// AMOUNT GRID (Matches Normal Recharge Plans Design)
        Obx(
          () => widget.controller.coinPackages.isNotEmpty
              ? GridView.builder(
                  shrinkWrap: true,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.78,
                  ),
                  itemCount: widget.controller.coinPackages.length,
                  physics: const NeverScrollableScrollPhysics(),
                  itemBuilder: (context, index) {
                    final item = widget.controller.coinPackages[index];
                    return Obx(
                      () => _buildSellerPackageCard(
                        index: index,
                        item: item,
                        isSelected: selectedIndex.value == index,
                      ),
                    );
                  },
                )
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: const [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          "No packages found!",
                          style: TextStyle(
                            fontFamily: 'Gilroy',
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Colors.black,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
        ),

        const SizedBox(height: 20),

        /// BUTTON`;

const oldGridRegex = /\/\/\/\s*AMOUNT GRID[\s\S]*?\/\/\/\s*BUTTON/;
if (oldGridRegex.test(content)) {
  content = content.replace(oldGridRegex, newGridCode);
}

// Replace the old amountCard method with _buildSellerPackageCard
const oldAmountCardRegex = /\/\/\/\s*AMOUNT CARD WITH USD PRICE[\s\S]*?\}\s*\}\s*$/;
const newPackageCardCode = `  /// PACKAGE CARD MATCHING NORMAL RECHARGE DESIGN
  Widget _buildSellerPackageCard({
    required int index,
    required CoinPackage item,
    required bool isSelected,
  }) {
    final String localSym = (item.localCurrencySymbol != null && item.localCurrencySymbol!.isNotEmpty)
        ? item.localCurrencySymbol!
        : (item.currencySymbol ?? '\\$');
    final num effectivePrice = (item.localPrice != null && item.localPrice! > 0)
        ? item.localPrice!
        : (item.price ?? 0);
    final String priceStr = effectivePrice % 1 == 0
        ? effectivePrice.toInt().toString()
        : effectivePrice.toStringAsFixed(2);
    final String bonusText = (item.bonus != null && item.bonus! > 0)
        ? '+\${item.bonus} Free'
        : '';
    final int coinsNum = item.coins ?? 0;

    String coinAsset = 'assets/images/icons/recommended_image.png';
    if (coinsNum < 5000) {
      coinAsset = 'assets/images/coin_tier_1.png';
    } else if (coinsNum < 50000) {
      coinAsset = 'assets/images/coin_tier_2.png';
    } else if (coinsNum < 200000) {
      coinAsset = 'assets/images/coin_tier_3.png';
    } else {
      coinAsset = 'assets/images/coin_tier_4.png';
    }

    return GestureDetector(
      onTap: () {
        selectedIndex.value = index;
        packageId.value = item.sId.toString();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? const Color(0xFFEF0083) : const Color(0xFFFEE6E7),
            width: isSelected ? 2 : 1,
          ),
          gradient: const LinearGradient(
            begin: Alignment(0.998, -0.063),
            end: Alignment(-0.998, 0.063),
            colors: [Color(0xFFFFE4E4), Color(0xFFFFFFFF)],
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: const Color(0xFFEF0083).withOpacity(0.25),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ]
              : [
                  BoxShadow(
                    color: const Color(0xFF8B4949).withOpacity(0.04),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ],
        ),
        child: Stack(
          children: [
            Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const SizedBox(height: 10),
                Image.asset(
                  coinAsset,
                  width: 38,
                  height: 38,
                  errorBuilder: (_, __, ___) => Image.asset(
                    'assets/images/icons/recommended_image.png',
                    width: 38,
                    height: 38,
                    errorBuilder: (_, __, ___) => const Icon(
                      Icons.monetization_on_rounded,
                      size: 36,
                      color: Color(0xFFEF0083),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      "\${item.coins ?? 0}",
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      style: const TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: Colors.black,
                      ),
                    ),
                  ),
                ),
                if (bonusText.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Text(
                      bonusText,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      style: const TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFFF39C12),
                      ),
                    ),
                  )
                else
                  const SizedBox(height: 12),
                const Spacer(),
                Container(
                  height: 34,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    borderRadius: const BorderRadius.only(
                      bottomLeft: Radius.circular(10),
                      bottomRight: Radius.circular(10),
                    ),
                    border: Border.all(
                      color: isSelected ? const Color(0xFFEF0083).withOpacity(0.2) : const Color(0xFFFFEBEB),
                      width: 1,
                    ),
                    color: isSelected ? const Color(0xFFFFF0F7) : Colors.white,
                  ),
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          "\$localSym \$priceStr",
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'Instrument Sans',
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: isSelected ? const Color(0xFFEF0083) : const Color(0xFF160010),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            if (isSelected)
              Positioned(
                top: 5,
                right: 5,
                child: Container(
                  width: 18,
                  height: 18,
                  decoration: const BoxDecoration(
                    color: Color(0xFFEF0083),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.check,
                    color: Colors.white,
                    size: 12,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
`;

if (oldAmountCardRegex.test(content)) {
  content = content.replace(oldAmountCardRegex, newPackageCardCode);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated recharge.dart for Coin Seller');
