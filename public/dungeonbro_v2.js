// DungeonBro V2 - Phaser 3 Based Commercial Prototype
const CONFIG = {
    type: Phaser.AUTO,
    width: 960,
    height: 540,
    parent: 'game-container',
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 1000 }, debug: false }
    },
    scene: { preload: preload, create: create, update: update }
};

const game = new Phaser.Game(CONFIG);

let player;
let cursors;
let keys;
let enemies;
let hud;
let isAttacking = false;
let combo = 0;
let lastAttackTime = 0;

function preload() {
    // Generate placeholder textures for standalone execution without external assets
    let graphics = this.make.graphics({ x: 0, y: 0, add: false });
    
    // Player texture (Blue Hero)
    graphics.fillStyle(0x4cc9f0, 1);
    graphics.fillRect(0, 0, 40, 60);
    graphics.generateTexture('player', 40, 60);
    graphics.clear();

    // Enemy texture (Red Goblin)
    graphics.fillStyle(0xef233c, 1);
    graphics.fillRect(0, 0, 36, 50);
    graphics.generateTexture('enemy', 36, 50);
    graphics.clear();

    // Hit effect (Orange burst)
    graphics.fillStyle(0xf97316, 1);
    graphics.fillCircle(15, 15, 15);
    graphics.generateTexture('hitFX', 30, 30);
    graphics.clear();
    
    // Background texture
    graphics.fillStyle(0x0d1117, 1);
    graphics.fillRect(0, 0, 960, 540);
    graphics.fillStyle(0x1a2e1a, 1); // Floor
    graphics.fillRect(0, 480, 960, 60);
    graphics.generateTexture('bg', 960, 540);
}

function create() {
    document.getElementById('loading').style.display = 'none';

    // Background
    this.add.image(480, 270, 'bg');

    // Player setup
    player = this.physics.add.sprite(200, 400, 'player');
    player.setCollideWorldBounds(true);
    player.setDragX(1500);
    player.hp = 100;
    player.maxHp = 100;

    // Floor physics group
    let floor = this.physics.add.staticGroup();
    let floorCollider = this.add.rectangle(480, 510, 960, 60, 0x000000, 0);
    floor.add(floorCollider);
    this.physics.add.collider(player, floor);

    // Enemies group
    enemies = this.physics.add.group();
    this.physics.add.collider(enemies, floor);

    // Spawn dummy enemies
    spawnEnemy.call(this, 600, 400);
    spawnEnemy.call(this, 800, 400);

    // Input bindings (DNF Style)
    cursors = this.input.keyboard.createCursorKeys();
    keys = this.input.keyboard.addKeys('Z,X,C,Q,W,E,R,SHIFT');

    // Attack Action
    keys.Z.on('down', performAttack, this);
    keys.Q.on('down', performSkill, this);

    // HUD Creation
    createHUD.call(this);
}

function update(time, delta) {
    if (player.hp <= 0) return;

    // Movement
    if (!isAttacking) {
        if (cursors.left.isDown) {
            player.setVelocityX(-300);
            player.setFlipX(true);
        } else if (cursors.right.isDown) {
            player.setVelocityX(300);
            player.setFlipX(false);
        } else {
            player.setAccelerationX(0);
        }

        if (cursors.up.isDown && player.body.touching.down) {
            player.setVelocityY(-600);
        }
    }

    // Reset Combo Window
    if (time - lastAttackTime > 600) {
        combo = 0;
    }
}

function performAttack() {
    if (isAttacking) return;
    isAttacking = true;
    player.setVelocityX(0);

    combo = (combo % 3) + 1;
    lastAttackTime = this.time.now;

    // Attack Animation Tween (Thrust)
    let dir = player.flipX ? -1 : 1;
    this.tweens.add({
        targets: player,
        x: player.x + (20 * dir),
        duration: 100,
        yoyo: true,
        onComplete: () => { isAttacking = false; }
    });

    // Hitbox detection
    let hitArea = new Phaser.Geom.Rectangle(player.x + (dir === 1 ? 0 : -60), player.y - 30, 60, 60);
    
    enemies.getChildren().forEach(enemy => {
        if (enemy.active && Phaser.Geom.Intersects.RectangleToRectangle(hitArea, enemy.getBounds())) {
            applyDamage.call(this, enemy, 10 * combo, dir);
        }
    });
}

function performSkill() {
    if (isAttacking) return;
    isAttacking = true;
    
    // Skill Visual (Flame Wave)
    let dir = player.flipX ? -1 : 1;
    let wave = this.physics.add.sprite(player.x, player.y, 'hitFX');
    wave.setScale(2);
    wave.setVelocityX(600 * dir);
    wave.body.setAllowGravity(false);

    this.physics.add.overlap(wave, enemies, (w, enemy) => {
        applyDamage.call(this, enemy, 30, dir);
        w.destroy();
    });

    setTimeout(() => { if(wave.active) wave.destroy(); }, 1000);
    setTimeout(() => { isAttacking = false; }, 300);
}

function applyDamage(enemy, damage, dir) {
    if (!enemy.active) return;
    enemy.hp -= damage;
    
    // Hit Stop & Camera Shake (Action feel)
    this.cameras.main.shake(100, 0.01);
    
    // Knockback
    enemy.setVelocityX(200 * dir);
    enemy.setVelocityY(-200);
    
    // Hit Effect
    let fx = this.add.sprite(enemy.x, enemy.y, 'hitFX');
    this.tweens.add({ targets: fx, scale: 2, alpha: 0, duration: 200, onComplete: () => fx.destroy() });

    // Damage Text
    let txt = this.add.text(enemy.x, enemy.y - 30, damage.toString(), { fontSize: '24px', fontStyle: 'bold', color: '#ffea00', stroke: '#000', strokeThickness: 4 });
    this.tweens.add({ targets: txt, y: enemy.y - 80, alpha: 0, duration: 600, onComplete: () => txt.destroy() });

    if (enemy.hp <= 0) {
        enemy.setTint(0x555555);
        enemy.body.enable = false;
        this.tweens.add({ targets: enemy, alpha: 0, duration: 1000, onComplete: () => enemy.destroy() });
    }
}

function spawnEnemy(x, y) {
    let enemy = enemies.create(x, y, 'enemy');
    enemy.setCollideWorldBounds(true);
    enemy.hp = 50;
    enemy.setDragX(500);
}

function createHUD() {
    hud = this.add.container(20, 20);
    
    // HP Bar Background
    let hpBg = this.add.rectangle(0, 0, 200, 20, 0x000000).setOrigin(0, 0);
    let hpFill = this.add.rectangle(2, 2, 196, 16, 0x06d6a0).setOrigin(0, 0);
    
    let hpText = this.add.text(100, 10, 'HP 100/100', { fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5, 0.5);
    
    hud.add([hpBg, hpFill, hpText]);
    hud.setScrollFactor(0); // Fix to screen
}
