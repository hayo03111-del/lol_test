// Extracted from CharacterController: _renektonData
CharacterController.prototype._renektonData = function() {  return CHAMPION_DATA.renekton; 
};

// Extracted from CharacterController: _renektonExtraAD
CharacterController.prototype._renektonExtraAD = function() {  return Math.max(0, this.stats.attackDamage - (computeChampionStats('renekton', this.champLevel)?.attackDamage || 0)); 
};

// Extracted from CharacterController: _renektonIsLowHp
CharacterController.prototype._renektonIsLowHp = function() {  return this.hp > 0 && this.hp / Math.max(1, this.maxHp) < 0.5; 
};

// Extracted from CharacterController: _renektonMarkCombat
CharacterController.prototype._renektonMarkCombat = function() { 
    if (this.championId !== 'renekton') return;
    const now = performance.now();
    this._renekton.lastCombatAt = now;
    this._renekton.nextRageDecayAt = 0; // 비전투 12초가 지나면 그때부터 0.25초마다 1씩 감소(PC 위키)
  
};

// Extracted from CharacterController: _renektonGainRage
CharacterController.prototype._renektonGainRage = function(amount, opts = {}) { 
    if (this.championId !== 'renekton' || amount <= 0) return 0;
    if (opts.empowered) return 0;
    let gain = amount * (this._renektonIsLowHp() ? 1.5 : 1);
    if (opts.capRemaining != null) gain = Math.min(gain, Math.max(0, opts.capRemaining));
    const before = this._renekton.rage;
    this._renekton.rage = Math.min(100, this._renekton.rage + gain);
    const actual = this._renekton.rage - before;
    if (actual > 0) updateBars(this);
    return actual;
  
};

// Extracted from CharacterController: _renektonMarkDamageDealt
CharacterController.prototype._renektonMarkDamageDealt = function(target) {  if (target && target.hp > 0) this._renektonMarkCombat(); 
};

// Extracted from CharacterController: _renektonPlay
CharacterController.prototype._renektonPlay = function(name, opts = {}) { 
    const clip = this.findAnimation(name);
    if (!clip) return null;
    return this.playFirstAvailable([name], opts);
  
};

// Extracted from CharacterController: _renektonFacePoint
CharacterController.prototype._renektonFacePoint = function(point) { 
    if (!point) return;
    const dir = new THREE.Vector3().subVectors(point, this.root.position).setY(0);
    if (dir.lengthSq() > 1e-8) this.faceDirectionInstant(dir.normalize());
  
};

// Extracted from CharacterController: _renektonFindLineHits
CharacterController.prototype._renektonFindLineHits = function(origin, dest, extraRange = 0) { 
    const dir = new THREE.Vector3().subVectors(dest, origin).setY(0);
    const len = dir.length();
    if (len < 1e-6) return [];
    dir.normalize();
    const hits = [];
    const halfWidth = lolRangeToWorld((CHAMPION_DATA.renekton.E.halfWidth || 45) + extraRange);
    for (const u of getAllEnemyUnits()) {
      const p = getWorldPosition(u);
      const r = getCollisionRadius(u);
      const v = new THREE.Vector3(p.x-origin.x,0,p.z-origin.z);
      const along = v.dot(dir);
      if (along < -r || along > len+r) continue;
      const lateral = Math.sqrt(Math.max(0, v.lengthSq() - along*along));
      if (lateral <= halfWidth+r) hits.push({unit:u, along});
    }
    hits.sort((a,b)=>a.along-b.along);
    return hits;
  
};

// Extracted from CharacterController: _renektonApplyQHit
CharacterController.prototype._renektonApplyQHit = function(target, empowered, rageTracker) { 
    if (!target || target.hp <= 0) return;
    const q=this._renektonData().Q, lvl=this.skillLevels.Q||1, extra=this._renektonExtraAD();
    const raw = (empowered ? skillVal(q.empoweredDamageByLevel,lvl) + q.empoweredBonusAdRatio*extra : skillVal(q.damageByLevel,lvl) + q.bonusAdRatio*extra);
    const dealt = applyDamage(target,{rawDamage:raw,damageType:DAMAGE_TYPE.PHYSICAL,isCritical:false,critMultiplier:1});
    if (dealt > 0) this._renektonMarkCombat();
    const isChamp = !!target.isChampion || target === this.currentTarget && !target.isMinion && !target.isTurret && !target.isNexus && !target.isInhibitor;
    const cap = Math.max(0, q.maxRageGenerated - rageTracker.generated);
    if (!empowered && cap > 0) {
      const gain = this._renektonGainRage(isChamp ? q.championRage : q.nonChampionRage, {capRemaining:cap});
      rageTracker.generated += gain;
    }
    let heal;
    if (empowered) {
      heal = isChamp ? skillVal(q.empoweredHealChampion,lvl) + q.empoweredHealChampionAdRatio*extra : skillVal(q.empoweredHealNonChampion,lvl) + q.empoweredHealNonChampionAdRatio*extra;
      if (isChamp) {
        const cap = skillVal(q.empoweredHealChampionCap,lvl);
        heal = Math.min(heal, Math.max(0, cap - (rageTracker.champHeal || 0)));
        rageTracker.champHeal = (rageTracker.champHeal || 0) + heal;
      }
    } else {
      heal = isChamp ? skillVal(q.healChampion,lvl) + q.healChampionAdRatio*extra : skillVal(q.healNonChampion,lvl) + q.healNonChampionAdRatio*extra;
      if (isChamp) {
        const cap = skillVal(q.healChampionCap,lvl);
        heal = Math.min(heal, Math.max(0, cap - (rageTracker.champHeal || 0)));
        rageTracker.champHeal = (rageTracker.champHeal || 0) + heal;
      }
    }
    // 공용 회복 배율(정령의형상 증폭 + 그리버스 감소) - 처치 누적 상한
    // (rageTracker.champHeal)은 이 배율과 무관하게 "의도된" 회복량 기준으로
    // 그대로 추적하고(위), 실제로 체력에 더해지는 마지막 적용 단계에서만 곱한다.
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0,heal) * getHealReceivedMultiplier(this));
  
};

// Extracted from CharacterController: _renektonCastQ
CharacterController.prototype._renektonCastQ = function(mouseWorldPoint, free=false) { 
    const q=this._renektonData().Q;
    if (!free && (this.cooldowns.Q>0 || this.state===STATE.DEAD || isSilenced(this))) return;
    if (!free) { this.cooldowns.Q=abilityHasteCooldown(this, q.cooldown); }
    const empowered = !free && this._renekton.rage >= 50;
    if (empowered) this._renekton.rage -= 50;
    this._clearActionTimers();
    this.setState(STATE.Q_CAST); this.currentActionKey='renektonQ'; this.currentPhase='STARTUP'; this.phaseCancelable=false;
    this._renektonFacePoint(mouseWorldPoint);
    const clip=this.findAnimation('Spell1');
    const dur=clip?.duration||0.45;
    this._renektonPlay('Spell1',{loop:THREE.LoopOnce,fade:0.05,clampWhenFinished:true});
    // 시전 시간이 없는 회전 베기(원작): 이동 중에 쓰면 회전 모션을 끝까지 보여 주며 그대로 움직인다(이동 루프가 덮어쓰지 않게 전환 클립으로 등록).
    if (clip) { this._beginTransientMoveClip('Spell1'); this._champTimeout(() => this._endTransientMoveClip('Spell1'), dur * 1000); }
    const timer=this._champTimeout(()=>{
      if (this.championId!=='renekton') return;
      const radius=q.range + (this._renekton.rActive ? (q.rRangeBonus || 0) : 0);
      const hits=findEnemiesInRadius(this.root.position,radius);
      const tracker={generated:0,champHeal:0};
      for(const h of hits) this._renektonApplyQHit(h.unit,empowered,tracker);
      updateBars(this);
      this.currentPhase='RECOVERY'; this.phaseCancelable=true;
      // PC 위키: 시전 후 0.25초 동안 평타·E·R 사용 불가(그 뒤 해제).
      const end=this._champTimeout(()=>{ if(this.currentActionKey==='renektonQ'){this.currentActionKey=null;this.currentPhase=null;this._resumeAfterAction();}},250);
      this._actionTimers.push(end);
    },0); // 버그 수정(타이밍 측정으로 발견): 예전엔 클립 길이×0.62(약 0.5초) 뒤 판정 - PC 위키는 시전 시간 없음(즉시)
    this._actionTimers.push(timer);
    updateBars(this);
  
};

// Extracted from CharacterController: _renektonCastW
CharacterController.prototype._renektonCastW = function(mouseWorldPoint, free=false) { 
    const w=this._renektonData().W;
    if (this._renekton.wArmed && !free) { this._renekton.wArmed=false; this._renekton.wEmpowered=false; return; }
    if (!free && (this.cooldowns.W>0 || this.state===STATE.DEAD || isSilenced(this))) return;
    if (!free) this.cooldowns.W=abilityHasteCooldown(this, skillVal(w.cooldown,this.skillLevels.W||1));
    const empowered = !free && this._renekton.rage>=50;
    if (empowered) this._renekton.rage-=50;
    this._renekton.wArmed=true; this._renekton.wEmpowered=empowered;
    // PC 위키: 7초 안의 다음 평타만 강화(예전엔 시간 제한이 없었다).
    this._renekton.wArmedUntil = performance.now() + (w.empowerWindowSec || 7) * 1000;
    updateBars(this);
    // 버그 수정: 평타 도중 W를 쓰면 공용 시전 경로가 평타를 취소하는데, W는 강화만 걸고 공격을
    // 재개하지 않아 레넥톤이 그 자리에 멈춰 있었다. 원작 W는 평타 타이머를 초기화하므로 바로 공격을 이어간다.
    if (!this.currentActionKey) this._resumeAfterAction();
  
};

// Extracted from CharacterController: _renektonBeginAttackSwing
CharacterController.prototype._renektonBeginAttackSwing = function() { 
    const target=this.currentTarget;
    if (!target || target.hp<=0) { this.currentTarget=null; return; }
    if (isSilenced(this) || isCrowdControlled(this)) return;
    const w=this._renektonData().W;
    if (this._renekton.wArmed && !target.isWard) { // 와드에는 강화 평타(W)를 쓰지 않고 일반 평타로 친다
      const empowered=this._renekton.wEmpowered;
      this._renekton.wArmed=false; this._renekton.wEmpowered=false;
      const hits=empowered?w.empoweredHits:w.hits;
      const raw=empowered?(skillVal(w.empoweredDamageByLevel,this.skillLevels.W||1)+w.empoweredTotalAdRatio*this.stats.attackDamage):(skillVal(w.damageByLevel,this.skillLevels.W||1)+w.totalAdRatio*this.stats.attackDamage);
      const stun=empowered?w.empoweredStunDuration:w.stunDuration;
      const targetLock=target;
      const origin=this.root.position.clone();
      this._renektonFacePoint(getWorldPosition(targetLock));
      this.currentActionKey='renektonW'; this.currentPhase='ACTIVE'; this.setState(STATE.W_CAST); this.phaseCancelable=false;
      this._renektonPlay(empowered?'Spell2U':'Spell2',{loop:THREE.LoopOnce,fade:0.03,clampWhenFinished:true});
      const clip=this.findAnimation(empowered?'Spell2U':'Spell2');
      const step=Math.max(0.08,(clip?.duration||0.5)/hits);
      const seq={target:targetLock,empowered,hits,hitIndex:0,elapsed:0,raw,stun,origin};
      this._renekton.wSeq=seq;
      return;
    }
    // 일반 평타는 기존 공통 시스템을 사용하지 않고 레넥톤 모션만 정확히 지정한다.
    const dir=new THREE.Vector3().subVectors(getWorldPosition(target),this.root.position).setY(0).normalize();
    this._renektonFacePoint(getWorldPosition(target));
    const clipName=(this.comboIndex++%2===0)?'Attack1':'Attack2';
    const clip=this.findAnimation(clipName); const interval=getAttackInterval(this.stats); const windup=getWindupDuration(this.stats); const recovery=getRecoveryDuration(this.stats);
    this.runAction(`renektonAA${this.comboIndex}`,STATE.ATTACK,{faceDir:dir,startupOverride:windup,recoveryOverride:recovery,timeScaleOverride:clip&&interval>0?attackClipTimeScale(this,clip,windup,interval):1,dataOverride:{clips:[clipName],startup:windup,recovery,cancelToMove:true,cancelToSpell:true,cancelable:true,dmg:0},onFire:()=>{
      if(!targetLockValid(target)) return;
      if(target.isWard){ wardSystem.hitWard(target,this); return; } // 32차: 와드는 평타 1회에 체력 1
      const attackResult={rawDamage:this.stats.attackDamage,damageType:DAMAGE_TYPE.PHYSICAL,isCritical:false,critMultiplier:1,isBasicAttack:true};
      applyDamage(target,attackResult); this._renektonOnBasicAttackHit(target);
    }});
    function targetLockValid(t){return t && t.hp>0;}
  
};

// Extracted from CharacterController: _renektonOnBasicAttackHit
CharacterController.prototype._renektonOnBasicAttackHit = function(target) { 
    if (this.championId!=='renekton' || !target) return;
    this._renektonMarkCombat();
    if (this._renekton.wSeq) return; // W sequence owns all its own rage/on-hit events.
    this._renektonGainRage(5);
    if (target.isTurret || target.isInhibitor || target.isNexus) return;
  
};

// Extracted from CharacterController: _renektonResolveWHit
CharacterController.prototype._renektonResolveWHit = function(seq) { 
    const target=seq.target;
    if(!target) return;
    if (target.hp<=0 && !seq.hitIndex) return;
    if (target.hp<=0 && seq.hitIndex>0) return;
    const raw=seq.raw;
    if (seq.empowered) {
      // 강화 W는 분노를 전혀 생성하지 않는다. 대상의 보호막을 먼저 파괴한다.
      if (target.shield>0 || (target.shieldEntries && target.shieldEntries.length)) { clearShields(target); target.shield=0; }
      applyDamage(target,{rawDamage:raw/seq.hits,damageType:DAMAGE_TYPE.PHYSICAL,isCritical:false,critMultiplier:1});
    } else {
      applyDamage(target,{rawDamage:raw/seq.hits,damageType:DAMAGE_TYPE.PHYSICAL,isCritical:false,critMultiplier:1});
      this._renektonGainRage(5); // 타격마다 평타 분노
      // 챔피언 적중 추가 분노 10은 스킬 한 번에 1회(예전엔 타격마다 들어가 2회 = 20이었다).
      if (seq.hitIndex===0 && (target.isChampion || (!target.isMinion&&!target.isTurret&&!target.isNexus&&!target.isInhibitor))) this._renektonGainRage(10);
    }
    this._renektonMarkCombat();
    if (seq.hitIndex===seq.hits-1 && !seq.empowered) applyStatus(target,{id:'renektonWstun',type:'STUN',duration:seq.stun,value:1});
    if (seq.hitIndex===seq.hits-1 && seq.empowered) applyStatus(target,{id:'renektonWstun',type:'STUN',duration:seq.stun,value:1});
  
};

// Extracted from CharacterController: _renektonCastE
CharacterController.prototype._renektonCastE = function(mouseWorldPoint, free=false) { 
    const e=this._renektonData().E;
    const now=performance.now();
    const isSecond=this._renekton.eSecondReadyUntil>now;
    if (!isSecond) {
      if(!free && (this.cooldowns.E>0 || this.state===STATE.DEAD || isSilenced(this))) return;
      if(!free) this.cooldowns.E=abilityHasteCooldown(this, skillVal(e.cooldown,this.skillLevels.E||1));
    }
    let dir=mouseWorldPoint?new THREE.Vector3().subVectors(mouseWorldPoint,this.root.position).setY(0):new THREE.Vector3(0,0,1).applyQuaternion(this.root.quaternion);
    if(dir.lengthSq()<1e-8)dir.set(0,0,1);dir.normalize();
    this.faceDirectionInstant(dir);
    const origin=this.root.position.clone();
    const dest=origin.clone().addScaledVector(dir,lolRangeToWorld(e.range));
    this._clearActionTimers(); this.currentActionKey=isSecond?'renektonE2':'renektonE1'; this.currentPhase='ACTIVE'; this.setState(STATE.E_CAST); this.phaseCancelable=false;
    this._renektonPlay('Spell3',{loop:THREE.LoopOnce,fade:0.03,clampWhenFinished:true});
    this._dashState={from:origin,to:dest,duration:0.28,elapsed:0,faceDir:dir};
    const hits=this._renektonFindLineHits(origin,dest,this._renekton.rActive?(CHAMPION_DATA.renekton.E.rHalfWidthBonus||0):0);
    const empowered=isSecond&&!free&&this._renekton.rage>=50;
    if(empowered)this._renekton.rage-=50;
    const timer=this._champTimeout(()=>{
      const lvl=this.skillLevels.E||1, extra=this._renektonExtraAD();
      for(const h of hits){
        const target=h.unit;
        const raw=empowered?(skillVal(e.empoweredDamageByLevel,lvl)+e.empoweredBonusAdRatio*extra):(skillVal(e.damageByLevel,lvl)+e.bonusAdRatio*extra);
        applyDamage(target,{rawDamage:raw,damageType:DAMAGE_TYPE.PHYSICAL,isCritical:false,critMultiplier:1});
        if(!empowered){this._renektonGainRage(target.isChampion?e.firstRageChampion:e.firstRageNonChampion);}
        this._renektonMarkCombat();
        if(empowered) applyStatus(target,{id:'renektonEshred',type:'ARMOR_SHRED',duration:e.armorShredDuration,value:skillVal(e.armorShredByLevel,lvl)/100});
      }
      if(!isSecond && hits.length){this._renekton.eSecondReadyUntil=performance.now()+4000;this._renekton.eFirstHit=true;}
      if(isSecond){this._renekton.eSecondReadyUntil=0;this._renekton.eFirstHit=false;}
      this.currentActionKey=null;this.currentPhase=null;this._resumeAfterAction();updateBars(this);
    },280);
    this._actionTimers.push(timer);
    updateBars(this);
  
};

// Extracted from CharacterController: _renektonCastR
CharacterController.prototype._renektonCastR = function(free=false) { 
    const r=this._renektonData().R;
    if(!free && (this.cooldowns.R>0 || this.state===STATE.DEAD || isSilenced(this))) return;
    if(!free)this.cooldowns.R=abilityHasteCooldown(this, skillVal(r.cooldown,this.skillLevels.R||1));
    if(this._renekton.rActive)return;
    const lvl=this.skillLevels.R||1;
    // 28차: 모션 테스트(free) 시전도 실제로 변신한다 - 예전엔 free면 변신 자체를 건너뛰어 크기가 안 바뀌었다(재사용 대기시간만 free가 면제).
    {
      this._renekton.rActive=true;this._renekton.rActiveUntil=performance.now()+r.duration*1000;this._renekton.rAuraAccum=0;this._renekton.rRageAccum=0;
      // 28차: PC 위키 - 크기 20% 증가(판정 반경 80 → 96). 예전엔 출처 없는 15%였고 판정 반경은 그대로였다.
      const sizeMul=1+(r.sizeIncreasePercent!=null?r.sizeIncreasePercent:20)/100;
      this._renekton.rBaseCollisionRadius=this.collisionRadius;this.collisionRadius*=sizeMul;
      this._renekton.rBonusMaxHp=skillVal(r.bonusMaxHp,lvl);this.bonusMaxHp=this._renekton.rBonusMaxHp;this.root.scale.setScalar((this._itemHeartsteelScale||1)*sizeMul);this.recomputeStats();
      this._renektonGainRage(r.immediateRage);this._renektonMarkCombat();
      if (this._renekton.rAuraVfx) vfx.stopRenektonRAura(this._renekton.rAuraVfx);
      this._renekton.rAuraVfx = vfx.startRenektonRAura(() => this.root.position, lolRangeToWorld(r.range));
    }
    this._clearActionTimers();this.currentActionKey='renektonR';this.currentPhase='STARTUP';this.setState(STATE.R_CAST);this.phaseCancelable=false;
    this._renektonPlay('Spell4',{loop:THREE.LoopOnce,fade:0.03,clampWhenFinished:true});
    const finish=this._champTimeout(()=>{if(this.currentActionKey==='renektonR'){this.currentActionKey=null;this.currentPhase=null;this._resumeAfterAction();}},Math.max(130,r.castTime*1000));this._actionTimers.push(finish);
    updateBars(this);
  
};

// Extracted from CharacterController: _renektonEndR
CharacterController.prototype._renektonEndR = function() { 
    if(!this._renekton.rActive)return;
    this._renekton.rActive=false;this._renekton.rActiveUntil=0;this._renekton.rAuraAccum=0;this._renekton.rRageAccum=0;this._renekton.rBonusMaxHp=0;
    if (this._renekton.rAuraVfx) { vfx.stopRenektonRAura(this._renekton.rAuraVfx); this._renekton.rAuraVfx=null; }
    if(this._renekton.rBaseCollisionRadius){this.collisionRadius=this._renekton.rBaseCollisionRadius;this._renekton.rBaseCollisionRadius=0;}
    this.bonusMaxHp=0;this.root.scale.setScalar(this._itemHeartsteelScale||1);this.recomputeStats();this.hp=Math.min(this.hp,this.maxHp);updateBars(this);
  
};

// Extracted from CharacterController: _renektonTick
CharacterController.prototype._renektonTick = function(dt) { 
    if(this.championId!=='renekton')return;
    const r=this._renekton;
    // W는 레넥톤이 죽거나 CC에 걸려도 이미 시작한 공격 시퀀스를 끝까지 진행한다.
    if(r.wSeq){
      r.wSeq.elapsed+=dt;
      // PC 위키: 강화 평타 시전 시간 0.2초 뒤 타격, 이후 0.528초 동안 이동·Q·E 불가(R 시전 시 즉시 해제 - controller_casting 참고).
      // 예전엔 타격을 클립 길이에 나눠 넣어(첫 타 약 0.55초) 판정이 늦고 잠금도 클립 끝까지(약 1.2초) 이어졌다.
      // 타격 사이 간격은 위키에 없어서 시전 시간이 끝나는 시점에 모든 타격을 차례로 판정한다.
      const wd=this._renektonData().W;
      if(r.wSeq.elapsed>=(wd.castTimeSec??0.2)){
        while(r.wSeq.hitIndex<r.wSeq.hits){this._renektonResolveWHit(r.wSeq);r.wSeq.hitIndex++;}
        r.wSeq=null; this.currentPhase='RECOVERY'; this.phaseCancelable=false;
        const recoveryTimer=this._champTimeout(()=>{ if(this.currentActionKey==='renektonW'){this.currentActionKey=null;this.currentPhase=null;this._resumeAfterAction();}},(wd.postHitLockSec??0.528)*1000);
        this._actionTimers.push(recoveryTimer);
      }
    }
    const now=performance.now();
    if(r.rActive){
      this._renektonMarkCombat();
      r.rRageAccum+=dt;
      while(r.rRageAccum>=1){r.rRageAccum-=1;this._renektonGainRage(5);}
      r.rAuraAccum+=dt;
      const rdTick=this._renektonData().R; const tickSec=rdTick.tickSec||1;
      while(r.rAuraAccum>=tickSec){
        r.rAuraAccum-=tickSec;
        const rd=rdTick,lvl=this.skillLevels.R||1;
        // 0.5초마다 초당 피해의 절반(PC 위키: 30/75/120 + 추가 AD 5% + AP 5%).
        const raw=(skillVal(rd.damagePerSecond,lvl)+rd.bonusAdRatio*this._renektonExtraAD()+rd.apRatio*(this.stats.abilityPower||0))*tickSec;
        const radius=rd.range;
        for(const h of findEnemiesInRadius(this.root.position,radius))applyDamage(h.unit,{rawDamage:raw,damageType:DAMAGE_TYPE.MAGICAL,isCritical:false,critMultiplier:1});
      }
      if(now>=r.rActiveUntil)this._renektonEndR();
    } else {
      // 버그 수정: 예전엔 비전투 17초 뒤부터 5초마다 20씩 깎였다. PC 위키: 12초 뒤부터 0.25초마다 1(초당 4).
      const pd=this._renektonData().passive;
      const since=(now-r.lastCombatAt)/1000;
      const exitSec=pd.combatExitSec||12, stepMs=(pd.rageDecayInterval||0.25)*1000, stepAmt=pd.rageDecayAmount||1;
      if(r.rage>0 && since>=exitSec){
        if(!r.nextRageDecayAt)r.nextRageDecayAt=r.lastCombatAt+exitSec*1000+stepMs;
        while(now>=r.nextRageDecayAt && r.rage>0){r.rage=Math.max(0,r.rage-stepAmt);r.nextRageDecayAt+=stepMs;}
      } else if(since<exitSec) r.nextRageDecayAt=0;
    }
    if(r.wArmed && r.wArmedUntil && now>=r.wArmedUntil && !r.wSeq){r.wArmed=false;r.wEmpowered=false;r.wArmedUntil=0;}
    // E 2단 재사용 창 만료
    if(r.eSecondReadyUntil && now>=r.eSecondReadyUntil){r.eSecondReadyUntil=0;r.eFirstHit=false;}
    updateBars(this);
  
};

