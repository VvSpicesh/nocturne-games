const MahjongHu={
  canWin(hand,missingSuit=null){
    // TODO: 实现标准胡、七对、龙七对等。
    if(missingSuit && hand.some(tile=>tile.suit===missingSuit)) return false;
    return false;
  }
};
