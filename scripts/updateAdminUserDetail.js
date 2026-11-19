const fs = require('fs');
const filePath = 'c:/Users/ADMIN/Desktop/projects/xamp/filive-admin/src/app/(dashboard)/users/[id]/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const helpersCode = `
  const getWealthNum = (u: any): number => {
    if (!u) return 0;
    if (typeof u.wealthLevelNumber === 'number') return u.wealthLevelNumber;
    if (typeof u.wealthLevel === 'number') return u.wealthLevel;
    if (typeof u.wealthLevel === 'object' && typeof u.wealthLevel?.levelNumber === 'number') return u.wealthLevel.levelNumber;
    if (typeof u.richLevelInfo?.currentLevel?.levelNumber === 'number') return u.richLevelInfo.currentLevel.levelNumber;
    if (typeof u.levelInfo?.currentLevel?.levelNumber === 'number') return u.levelInfo.currentLevel.levelNumber;
    if (typeof u.level === 'number') return u.level;
    if (typeof u.levelNumber === 'number') return u.levelNumber;
    return 0;
  };

  const getCharmNum = (u: any): number => {
    if (!u) return 0;
    if (typeof u.charmLevelNumber === 'number') return u.charmLevelNumber;
    if (typeof u.charmLevel === 'number') return u.charmLevel;
    if (typeof u.charmLevel === 'object' && typeof u.charmLevel?.levelNumber === 'number') return u.charmLevel.levelNumber;
    if (typeof u.charmLevelInfo?.currentLevel?.levelNumber === 'number') return u.charmLevelInfo.currentLevel.levelNumber;
    return 0;
  };

  const getWealthName = (u: any): string => {
    const lvl = getWealthNum(u);
    const n = typeof u?.wealthLevel === 'object' ? u.wealthLevel?.name : (u?.richLevelInfo?.currentLevel?.name || u?.levelInfo?.currentLevel?.name);
    if (typeof n === 'string' && n && n !== 'Bronze Explorer') return n;
    if (n && typeof n === 'object') {
      const en = n.en || n.name;
      if (typeof en === 'string' && en && en !== 'Bronze Explorer') return en;
    }
    return lvl > 0 ? \`Wealth Lv.\${lvl}\` : 'Wealth Lv.0';
  };

  const getCharmName = (u: any): string => {
    const lvl = getCharmNum(u);
    const n = typeof u?.charmLevel === 'object' ? u.charmLevel?.name : u?.charmLevelInfo?.currentLevel?.name;
    if (typeof n === 'string' && n && n !== 'Rising Star') return n;
    if (n && typeof n === 'object') {
      const en = n.en || n.name;
      if (typeof en === 'string' && en && en !== 'Rising Star') return en;
    }
    return lvl > 0 ? \`Charm Lv.\${lvl}\` : 'Charm Lv.0';
  };
`;

const target1 = '// Edit Profile State';
if (!content.includes('const getWealthNum =')) {
  content = content.replace(target1, helpersCode + '\r\n  ' + target1);
}

// Update header balance to include Rich Level and Charm Level
const oldHeaderBalance = `<div className="rounded-2xl border border-neutral-200 px-4 py-2 flex items-center gap-2 bg-neutral-50/50">
                <IconCoins className="h-5 w-5 text-amber-500" />`;

const newHeaderBalance = `<div className="rounded-2xl border border-amber-200/70 px-3.5 py-2 flex items-center gap-2 bg-gradient-to-r from-amber-50 to-orange-50/50 shadow-sm">
                <IconShield className="h-5 w-5 text-amber-500" />
                <div className="text-right">
                  <div className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Rich Level</div>
                  <div className="font-black text-amber-950 text-sm leading-tight">Lv.{getWealthNum(user)}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-pink-200/70 px-3.5 py-2 flex items-center gap-2 bg-gradient-to-r from-pink-50 to-rose-50/50 shadow-sm">
                <IconSparkles className="h-5 w-5 text-rose-500" />
                <div className="text-right">
                  <div className="text-[10px] font-black text-rose-600 uppercase tracking-wider">Charm Level</div>
                  <div className="font-black text-rose-950 text-sm leading-tight">Lv.{getCharmNum(user)}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-200 px-4 py-2 flex items-center gap-2 bg-neutral-50/50">
                <IconCoins className="h-5 w-5 text-amber-500" />`;

if (content.includes(oldHeaderBalance)) {
  content = content.replace(oldHeaderBalance, newHeaderBalance);
}

// Add Honor & Levels Card to details tab
const detailsTabMarkerCRLF = '{activeTab === "details" && (\r\n              <div className="space-y-8 animate-in fade-in duration-300">';
const detailsTabMarkerLF = '{activeTab === "details" && (\n              <div className="space-y-8 animate-in fade-in duration-300">';

const levelsCard = `
                {/* Honor & Levels Card (Rich Level & Charm Level) */}
                <div className="rounded-3xl border border-neutral-200/80 bg-gradient-to-b from-neutral-50/70 to-white p-5 md:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black">
                        <IconAward className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-neutral-900">Honor & Levels</h3>
                        <p className="text-xs font-medium text-neutral-500">User rich spending level and charm receiving status</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* RICH LEVEL CARD */}
                    <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50/30 to-white p-4 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md">
                            <IconShield className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="text-[11px] font-extrabold text-amber-700 uppercase tracking-wider">Rich Level</div>
                            <div className="text-xl font-black text-neutral-900 flex items-center gap-2">
                              Lv.{getWealthNum(user)}
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 border border-amber-300">
                                {getWealthName(user)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1.5">
                        <div className="flex justify-between text-xs font-bold text-neutral-600">
                          <span>Spent / Progress</span>
                          <span>{Number(user.wealthCoins || user.coins || 0).toLocaleString()} coins</span>
                        </div>
                        <div className="w-full bg-amber-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-amber-500 to-orange-500 h-2.5 rounded-full transition-all"
                            style={{
                              width: \`\${Math.min(100, Math.max(0, user.wealthLevel?.progressPercentage ?? user.richLevelInfo?.progressPercentage ?? (getWealthNum(user) > 0 ? 50 : 0)))}%\`
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-semibold text-neutral-400">
                          <span>Min: {Number(user.wealthLevel?.minCoins ?? user.richLevelInfo?.currentLevel?.minCoins ?? 0).toLocaleString()}</span>
                          <span>Max: {Number(user.wealthLevel?.maxCoins ?? user.richLevelInfo?.currentLevel?.maxCoins ?? 1000).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* CHARM LEVEL CARD */}
                    <div className="relative overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-pink-50 via-rose-50/30 to-white p-4 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white flex items-center justify-center shadow-md">
                            <IconSparkles className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="text-[11px] font-extrabold text-rose-700 uppercase tracking-wider">Charm Level</div>
                            <div className="text-xl font-black text-neutral-900 flex items-center gap-2">
                              Lv.{getCharmNum(user)}
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-800 border border-rose-300">
                                {getCharmName(user)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1.5">
                        <div className="flex justify-between text-xs font-bold text-neutral-600">
                          <span>Received Gifts / Progress</span>
                          <span>{Number(user.charmCoins || 0).toLocaleString()} charm gifts</span>
                        </div>
                        <div className="w-full bg-pink-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-pink-500 to-rose-600 h-2.5 rounded-full transition-all"
                            style={{
                              width: \`\${Math.min(100, Math.max(0, user.charmLevel?.progressPercentage ?? user.charmLevelInfo?.progressPercentage ?? (getCharmNum(user) > 0 ? 50 : 0)))}%\`
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-semibold text-neutral-400">
                          <span>Min: {Number(user.charmLevel?.minCoins ?? user.charmLevelInfo?.currentLevel?.minCoins ?? 0).toLocaleString()}</span>
                          <span>Max: {Number(user.charmLevel?.maxCoins ?? user.charmLevelInfo?.currentLevel?.maxCoins ?? 1000).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>`;

if (!content.includes('Honor & Levels Card (Rich Level & Charm Level)')) {
  if (content.includes(detailsTabMarkerCRLF)) {
    content = content.replace(detailsTabMarkerCRLF, detailsTabMarkerCRLF + levelsCard);
  } else if (content.includes(detailsTabMarkerLF)) {
    content = content.replace(detailsTabMarkerLF, detailsTabMarkerLF + levelsCard);
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('SUCCESS');
