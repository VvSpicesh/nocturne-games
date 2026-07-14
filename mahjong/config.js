const KEY="nocturne_mahjong_rules_v08";

export const defaultRules={
  exchangeThree:true,
  gangRain:true
};

export function loadRules(){
  try{
    return {...defaultRules,...JSON.parse(localStorage.getItem(KEY)||"{}")};
  }catch{
    return {...defaultRules};
  }
}

export function saveRules(rules){
  localStorage.setItem(KEY,JSON.stringify(rules));
}
