class MainScene extends Phaser.Scene {
  constructor() {
    //
    super({ key: "MainScene" });
    this.filteredData = [];
  }

  init() {
    this.activeView = null;
    this.currentMode = "world";

    this.lastLocationId = 1;
    this.isTransitioning = false;
  }

  preload() {
    this.load.image(
      "player",
      "https://ps.w.org/instant-images/assets/icon-256x256.png"
    );
    this.load.image(
      "trigger-icon",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Green_icon_-_Star.ZGH.png/640px-Green_icon_-_Star.ZGH.png"
    );
    this.load.image(
      "worldmapview-image",
      "https://static.wikia.nocookie.net/projectsekai/images/b/ba/Worldmap.png"
    );
    for (const id in locationRegistry) {
      locationRegistry[id].preload(this);
    }
  }

  //on creation:
  async create() {
    const success = await this.loadAndFilterConvo();
    if (!success) return;

    this.createOverlay();
    this.switchView("world", this.lastLocationId, this.filteredData);
  }

  //animations
  update(time, delta) {
    if (this.activeView && this.activeView.update) {
      this.activeView.update(time, delta);
    }
  }

  //gets convo data
  async loadAndFilterConvo() {
    const csvUrl =
      "https://raw.githubusercontent.com/entomologist1/ttwopjsk/refs/heads/main/test_convolist.csv";
    const target = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    try {
      const rawData = await this.loadCSV(csvUrl);
      const arrayForSorting = this.preprocessData(rawData);
      const result = this.pickRandomValidCombination(
        arrayForSorting,
        target,
        2
      );
      this.filteredData = this.filterRawDataByIDs(arrayForSorting, result);
      console.log("chosen:", this.filteredData);
      return true;
    } catch (err) {
      console.error("CSV load failed:", err);

      if (!this.scene.get("ErrorScene")) {
        this.scene.add("ErrorScene", ErrorScene, true, {
          message: "couldnt load scene data!!! x("
        });
      } else {
        this.scene.start("ErrorScene", {
          message: "couldnt load scene data!!! x("
        });
      }

      return false;
    }
  }

  //loading csv functions
  async loadCSV(url) {
    return new Promise((resolve, reject) => {
      Papa.parse(url, {
        download: true,
        header: false,
        skipEmptyLines: true,
        dynamicTyping: true,
        quoteChar: '"',
        complete: (results) => resolve(results.data),
        error: (err) => reject(err)
      });
    });
  }
  preprocessData(rawData) {
    return rawData
      .slice(1) //skip header
      .filter((row) => row.length >= 3)
      .map((row) => {
        const id = row[0];
        let numberList;

        if (typeof row[1] === "string") {
          numberList = row[1].split(",").map(Number);
        } else if (Array.isArray(row[1])) {
          numberList = row[1];
        } else if (typeof row[1] === "number") {
          numberList = [row[1]];
        } else {
          numberList = [];
        }

        const location = row[2];
        return [id, numberList, location];
      });
  }
  pickRandomValidCombination(data, targetArray, maxPerLocation = 2) {
    console.log("randomizing...");

    const targetSet = new Set(targetArray);
    const targetSize = targetSet.size;

    // Shuffle once at the start
    const shuffled = [...data];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    function helper(index, usedNums, selectedIDs, locCounts) {
      if (
        usedNums.size === targetSize &&
        [...usedNums].every((n) => targetSet.has(n))
      ) {
        return [...selectedIDs];
      }

      for (let i = index; i < shuffled.length; i++) {
        const [id, numbers, location] = shuffled[i];

        // Skip if any number is already used
        let hasConflict = false;
        for (const n of numbers) {
          if (usedNums.has(n)) {
            hasConflict = true;
            break;
          }
        }
        if (hasConflict) continue;

        // Skip if location maxed out
        if ((locCounts[location] || 0) >= maxPerLocation) continue;

        // Try next
        const newUsed = new Set(usedNums);
        for (const n of numbers) newUsed.add(n);

        const newLocCounts = {
          ...locCounts,
          [location]: (locCounts[location] || 0) + 1
        };

        const result = helper(
          i + 1,
          newUsed,
          [...selectedIDs, id],
          newLocCounts
        );
        if (result) return result;
      }

      return null;
    } //yay forloop

    return helper(0, new Set(), [], {});
  }
  filterRawDataByIDs(rawData, idList) {
    const idSet = new Set(idList);
    return rawData.filter((row) => idSet.has(row[0]));
  }

  //menu overlay
  createOverlay() {
    this.scene.launch("menuOverlay");
    this.scene.bringToTop("menuOverlay");
  }
 
  //toggles world button transition btw world/worldmap
  toggleMode() {
    if (this.currentMode === "world") {
      this.lastLocationId = this.activeView.getLocationId();
      this.fadeTransition(this.lastLocationId);
    } else if (this.currentMode === "worldMap") {
      this.fadeMapTransition(this.lastLocationId);
    }
    //add more if needed
  }

  //actually handles creating/destroying the views
  switchView(mode, locationId, convoData = []) {
    if (this.activeView && this.activeView.destroy) {
      this.activeView.destroy();
    }
    this.cameras.main.setScroll(0, 0);

    if (mode === "world") {
      this.activeView = new WorldView(this, locationId, convoData);
    } else if (mode === "worldMap") {
      //we are at worldmap
      this.activeView = new WorldMapView(this, locationId);
    }
    //add more if needed
    this.currentMode = mode;
  }

  //transition to worldmap
  fadeTransition(locationId) {
    if (this.isTransitioning) return; // 🚫 block re-entry
    this.isTransitioning = true;

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.switchView("worldMap", locationId, this.filteredData);
      this.cameras.main.fadeIn(200, 0, 0, 0);

      this.cameras.main.once("camerafadeincomplete", () => {
        this.isTransitioning = false;
      });
    });
  }

  //transition to world
  fadeMapTransition(locationId) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.switchView("world", locationId, this.filteredData);
      this.cameras.main.fadeIn(200, 0, 0, 0);

      this.cameras.main.once("camerafadeincomplete", () => {
        this.isTransitioning = false;
      });
    });
  }
  slideMapTransition(locationId) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const oldView = this.activeView;
    const cover = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xff0000)
      .setOrigin(0, 0)
      .setDepth(103939)
      .setScrollFactor(0);
    cover.x = -this.scale.width;

    this.tweens.add({
      targets: cover,
      x: 0,
      duration: 300,
      ease: "Cubic.easeInOut",
      onComplete: () => {
        const newWorld = new WorldView(this, locationId, this.filteredData);
        newWorld.container.x = 0;

        this.time.delayedCall(100, () => {
          oldView.destroy();
          this.activeView = newWorld;
          this.currentMode = "world";

          this.tweens.add({
            targets: cover,
            x: this.scale.width,
            duration: 300,
            ease: "Cubic.easeInOut",
            onComplete: () => {
              cover.destroy();
              this.isTransitioning = false;
            }
          });
        });
      }
    });
  }
}

class WorldView {
  constructor(scene, locationId, convoData = []) {
    this.scene = scene;
    this.location = locationRegistry[locationId];
    this.locationId = locationId;
    this.convoData = convoData.filter((row) => {
      //only convodata for current scene
      const locationCol = row[2]; // third column is locationID
      if (Array.isArray(locationCol)) {
        return locationCol.includes(locationId);
      }
      return locationCol === locationId;
    });

    console.log(this.convoData);

    this.container = scene.add.container(0, 0);

    //why do i even have a player. Whatever. Get contained idiot
    const spawn = this.location.getSpawnCoordinates();
    this.player = scene.physics.add.sprite(spawn.x, spawn.y, "player");
    this.player.setCollideWorldBounds(true);
    this.container.add(this.player);

    scene.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    scene.cameras.main.setBounds(0, 0, 2700, 2000);
    scene.physics.world.setBounds(0, 0, 2700, 2000);

    this.locationBackground = scene.add
      .image(0, 0, this.location.backgroundKey)
      .setOrigin(0);
    this.container.addAt(this.locationBackground, 0);

    if (this.location.foregroundKey) {
      this.locationForeground = scene.add
        .image(0, 0, this.location.foregroundKey)
        .setOrigin(0);
      this.container.add(this.locationForeground);
    }

    const collisionKey = this.location.collisionKey;
    const texture = scene.textures.get(collisionKey)?.getSourceImage();

    if (!texture) {
      console.log(`Missing collision texture: ${collisionKey}`);
    } else {
      if (scene.textures.exists("collisionData")) {
        scene.textures.remove("collisionData");
      }
      this.collisionCanvas = scene.textures.createCanvas(
        "collisionData",
        texture.width,
        texture.height
      );
      this.collisionCanvas.draw(0, 0, texture);
    }

    //bullsjhit
    this.player.setDepth(5);

    this.collisionOverlay = scene.add
      .image(0, 0, collisionKey)
      .setOrigin(0)
      .setAlpha(0.3);
    this.container.add(this.collisionOverlay);

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.lastValidPosition = new Phaser.Math.Vector2(
      this.player.x,
      this.player.y
    );

    //if convodata contains convos with current locationID, load here

    this.interactables = [];
    const spawnPoints = this.location.getAreaConvoSpawn(); // returns array of Phaser.Math.Vector2
    let spawnIndex = 0;
    this.convoData.forEach((row) => {
      const convoId = row[0];
      console.log("convoId is: ", convoId);

      //cycle through spawn points
      const pos = spawnPoints[spawnIndex % spawnPoints.length];
      spawnIndex++;

      const obj = new areaConvoObject(this.scene, pos, "VisualNovelScene", {
        convoId: convoId,
        meta: row
      });
      this.interactables.push(obj);
    });

    //MORE FUNCTIONS!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! :D
  }

  update() {
    //more player bullshit. surely it would have been easier to just have the background move around by itself. whatever
    const speed = 350;
    const margin = 150;
    const pointer = this.scene.input.activePointer;
    let moveX = 0,
      moveY = 0;

    if (this.cursors.left.isDown) moveX = -1;
    else if (this.cursors.right.isDown) moveX = 1;
    if (this.cursors.up.isDown) moveY = -1;
    else if (this.cursors.down.isDown) moveY = 1;

    //this is menuOverlay stuff
    const hoveringMenu = this.scene.registry.get("menuButtonHover");

    if (!hoveringMenu && moveX === 0 && moveY === 0 && pointer.manager.isOver) {
      const w = this.scene.game.config.width,
        h = this.scene.game.config.height;
      if (pointer.x < margin) moveX = -1;
      else if (pointer.x > w - margin) moveX = 1;
      if (pointer.y < margin) moveY = -1;
      else if (pointer.y > h - margin) moveY = 1;
    }

    const newX = this.player.x + moveX * 5;
    const newY = this.player.y + moveY * 5;

    if (this.isWalkable(newX, newY)) {
      this.player.setVelocity(moveX * speed, moveY * speed);
      this.lastValidPosition.set(this.player.x, this.player.y);
    } else {
      this.player.setVelocity(0);
      this.player.setPosition(
        this.lastValidPosition.x,
        this.lastValidPosition.y
      );
    }
  }

  isWalkable(x, y) {
    if (!this.collisionCanvas) return true;

    const halfW = this.player.width / 2,
      halfH = this.player.height / 2;
    const points = [
      { x: x - halfW, y: y - halfH },
      { x: x + halfW, y: y - halfH },
      { x: x - halfW, y: y + halfH },
      { x: x + halfW, y: y + halfH }
    ];
    return points.every((point) => {
      const pixel = this.collisionCanvas.getPixel(
        Math.floor(point.x),
        Math.floor(point.y)
      );
      return pixel && pixel.r > 128 && pixel.g > 128 && pixel.b > 128;
    });
  }

  getLocationId() {
    return this.location.id;
  }

  destroy() {
    this.container.destroy();
    this.scene.cameras.main.stopFollow();
    this.scene.physics.world.setBounds(
      0,
      0,
      this.scene.scale.width,
      this.scene.scale.height
    );
    if (this.scene.textures.exists("collisionData")) {
      this.scene.textures.remove("collisionData");
    }
    this.collisionCanvas = null;
    this.interactables.forEach((obj) => obj.destroy());
    this.interactables = [];
  }
}

class WorldMapView {
  constructor(scene, lastLocationId) {
    this.scene = scene;
    const worldLocationData = {
      1: { position: new Phaser.Math.Vector2(750, 625), maxSize: 150 },
      2: { position: new Phaser.Math.Vector2(400, 175), maxSize: 150 },
      3: { position: new Phaser.Math.Vector2(550, 375), maxSize: 150 },
      4: { position: new Phaser.Math.Vector2(250, 370), maxSize: 100 },
      5: { position: new Phaser.Math.Vector2(900, 375), maxSize: 100 }
    };

    // container for everything in the map
    this.container = scene.add.container(0, 0);

    // background map image
    this.mapImage = scene.add.image(0, 0, "worldmapview-image").setOrigin(0);
    this.mapWidth = 1329;
    this.mapHeight = 766;
    this.mapImage.setDisplaySize(this.mapWidth, this.mapHeight);
    this.mapImage.setInteractive(); //background is interactive
    this.container.add(this.mapImage);

    // store buttons
    this.buttons = [];

    //world assignments
    this.realworld = scene.add.container(0, 0); //buttons 1–5
    this.fakeworld = scene.add.container(0, 0); //buttons 6–8
    this.container.add(this.realworld);
    scene.add.existing(this.fakeworld);

    //location buttons positioning here
    const keys = Object.keys(locationRegistry);

    //sekai stuff
    const phoneBg = this.scene.add.rectangle(
      1000, // center X
      175, // center Y
      225, // width
      375, // height
      0xff0000,
      0.2
    );
    phoneBg.setStrokeStyle(3, 0xff0000);

    //container stuff for sekai
    this.fakeworld = scene.add.container(phoneBg.x, phoneBg.y);
    this.fakeworld.rotation = Phaser.Math.DegToRad(-5);
    phoneBg.setPosition(0, 0);
    this.fakeworld.add(phoneBg);

    keys.forEach((key, index) => {
      const locId = parseInt(key);

      let x, y, maxSizeOption, textOption;

      if (locId <= 5) {
        // ✅ pull from worldLocationData
        const location = worldLocationData[locId];
        x = location.position.x;
        y = location.position.y;
        maxSizeOption = location.maxSize;
        textOption = true;
      } else {
        // fake world layout
        const localIndex = index - 5;
        const cols = 1;
        const spacingX = phoneBg.width / (cols + 1);
        const spacingY = 86;

        x = -phoneBg.width / 2 + spacingX * ((localIndex % cols) + 1);
        y = -phoneBg.height / 2 + 64 + Math.floor(localIndex / cols) * spacingY;

        maxSizeOption = 180;
        textOption = false;
      }

      const button = new WorldMapView.LocationButton(
        this.scene,
        x,
        y,
        // still pass locationRegistry here if button needs metadata beyond position/maxSize
        locationRegistry[locId],
        () => this.onButtonClick(locId),
        textOption,
        maxSizeOption
      );

      this.buttons.push(button);

      if (locId <= 5) {
        this.realworld.add(button.container);
      } else {
        this.fakeworld.add(button.container);
      }
    });

    //silly animation
    this.scene.tweens.add({
      targets: this.fakeworld, // the container holding rect + buttons
      x: 900, // target X
      y: 175, // target Y
      rotation: Phaser.Math.DegToRad(-15), // rotate to 0 degrees
      ease: "Power1", // easing function
      duration: 200 // 1 second
    });

    //dragging
    this.isDragging = false;
    this.dragStartPoint = new Phaser.Math.Vector2();
    this.containerStartPoint = new Phaser.Math.Vector2();
    this.draggingThreshold = 5;
    this.dragStarted = false;

    this.mapImage.on("pointerdown", this.handlePointerDown, this);
    scene.input.on("pointermove", this.handlePointerMove, this);
    scene.input.on("pointerup", this.handlePointerUp, this);
  }

  onButtonClick(locationId) {
    if (this.scene.isTransitioning) return;
    if (this.scene.activeView !== this) return;

    console.log(`Switching to location ${locationId}`);
    this.scene.slideMapTransition(locationId);
  }

  handlePointerDown(pointer) {
    this.isDragging = true;
    this.dragStarted = false;
    this.dragStartPoint.set(pointer.x, pointer.y);
    this.containerStartPoint.set(this.container.x, this.container.y);
  }

  handlePointerMove(pointer) {
    if (!this.isDragging) return;

    const dx = pointer.x - this.dragStartPoint.x;
    const dy = pointer.y - this.dragStartPoint.y;

    if (
      !this.dragStarted &&
      (Math.abs(dx) > this.draggingThreshold ||
        Math.abs(dy) > this.draggingThreshold)
    ) {
      this.dragStarted = true;
    }

    if (this.dragStarted) {
      const newX = Phaser.Math.Clamp(
        this.containerStartPoint.x + dx,
        -(this.mapWidth - this.scene.scale.width),
        0
      );
      const newY = Phaser.Math.Clamp(
        this.containerStartPoint.y + dy,
        -(this.mapHeight - this.scene.scale.height),
        0
      );

      this.container.setPosition(newX, newY);
    }
  }

  handlePointerUp() {
    this.isDragging = false;
    this.dragStarted = false;
  }

  update() {
    // No updates yet
  }

  getLocationId() {
    return 1; //placeholder
  }

  destroy() {
    this.container.destroy();

    this.mapImage.off("pointerdown", this.handlePointerDown, this);
    this.scene.input.off("pointermove", this.handlePointerMove, this);
    this.scene.input.off("pointerup", this.handlePointerUp, this);

    this.buttons.forEach((btn) => btn.destroy());
    this.buttons = [];
  }
}

WorldMapView.LocationButton = class {
  constructor(scene, x, y, location, onClick, textOption = true, maxSize = 64) {
    this.scene = scene;

    // group icon + label
    this.container = scene.add.container(x, y);

    // Icon
    this.icon = scene.add.image(0, 0, location.iconKey).setOrigin(0.5);

    // Scale icon proportionally to fit inside maxSize
    const originalWidth = this.icon.width;
    const originalHeight = this.icon.height;

    if (originalWidth > 0 && originalHeight > 0) {
      const scale = Math.min(maxSize / originalWidth, maxSize / originalHeight);
      this.icon.setScale(scale);
    }

    // Text (or null if disabled)
    this.text = null;
    if (textOption === true) {
      this.text = scene.add
        .text(0, maxSize / 2 + 18, location.name, {
          fontSize: "16px",
          color: "#ffffff",
          backgroundColor: "rgba(0,0,0,0.5)",
          padding: { x: 4, y: 2 },
          align: "center"
        })
        .setOrigin(0.5);
    }

    // Add to container
    if (this.text) {
      this.container.add([this.icon, this.text]);
    } else {
      this.container.add(this.icon);
    }

    // Auto-calc hit area from children bounds
    const bounds = this.container.getBounds();
    this.container.setSize(bounds.width, bounds.height);

    // Make container interactive
    this.container.setInteractive({ useHandCursor: true });
    this.container.on("pointerdown", onClick);

    //hover
    this.container.on("pointerover", () => {
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 200,
        ease: "Power1"
      });
    });

    this.container.on("pointerout", () => {
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: "Power1"
      });
    });
  }

  destroy() {
    this.container.destroy();
  }
};

class locationDetails {
  constructor(
    name = null,
    id = null,
    backgroundKey = null,
    backgroundFile = null,
    collisionKey = null,
    collisionFile = null,
    foregroundKey = null,
    foregroundFile = null,
    spawnPoint = null,
    iconKey = null,
    iconFile = null,
    areaConvoSpawn = [
      new Phaser.Math.Vector2(500, 600),
      new Phaser.Math.Vector2(500, 750),
      new Phaser.Math.Vector2(500, 750),
      new Phaser.Math.Vector2(500, 800)
    ]
  ) {
    this.name = name;
    this.id = id;

    this.backgroundKey = backgroundKey;
    this.backgroundFile = backgroundFile;

    this.collisionKey = collisionKey;
    this.collisionFile = collisionFile;

    this.foregroundKey = foregroundKey;
    this.foregroundFile = foregroundFile;

    this.spawnPoint = spawnPoint;
    this.areaConvoSpawn = areaConvoSpawn;

    this.iconKey = iconKey;
    this.iconFile = iconFile;
  }

  preload(scene) {
    scene.load.image(this.backgroundKey, this.backgroundFile);
    scene.load.image(this.collisionKey, this.collisionFile);

    if (this.foregroundKey && this.foregroundFile) {
      scene.load.image(this.foregroundKey, this.foregroundFile);
    }

    if (this.iconKey && this.iconFile) {
      scene.load.image(this.iconKey, this.iconFile);
    }
  }

  render(scene) {
    scene.add.image(0, 0, this.backgroundKey).setOrigin(0).setScrollFactor(1);
    if (this.foregroundKey) {
      scene.add.image(0, 0, this.foregroundKey).setOrigin(0).setScrollFactor(1);
    }
  }

  getSpawnCoordinates() {
    return { x: this.spawnPoint.x, y: this.spawnPoint.y };
  }

  getAreaConvoSpawn() {
    return this.areaConvoSpawn;
  }
}

const locationRegistry = {
  1: new locationDetails(
    "Test Location", //name
    1, //id
    "face", //backgroundkey
    "https://i.ibb.co/zhFCWbqD/Untitled5657-0000-01-23-20250721214420.png", //backgroundfile
    "collision", //collisionkey
    "https://i.imgur.com/8qx7IAi.png", //collisionfile
    null, //foregroundkey
    null, //foregroundfile
    new Phaser.Math.Vector2(500, 500), //spawnpoint
    "mapbutton1", //mapbuttonkey
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Green_icon_-_Help.ZGH.png/640px-Green_icon_-_Help.ZGH.png" //mapbuttonfile
    //areaconvospawns will be later when im not lazy
  ),

  2: new locationDetails(
    "Desert",
    2,
    "bg_desert",
    "https://i.ibb.co/zhFCWbqD/Untitled5657-0000-01-23-20250721214420.png",
    "col_desert",
    "https://files.catbox.moe/bcc6ju.png",
    null,
    null,
    new Phaser.Math.Vector2(500, 200),
    "mapbutton2",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Green_icon_-_Help.ZGH.png/640px-Green_icon_-_Help.ZGH.png"
  ),

  3: new locationDetails(
    "This is three",
    3,
    "background3",
    "https://i.ibb.co/zhFCWbqD/Untitled5657-0000-01-23-20250721214420.png",
    "collision3",
    "https://i.imgur.com/b5MJOiU.jpeg",
    null,
    null,
    new Phaser.Math.Vector2(500, 500),
    "mapbutton3",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Green_icon_-_Help.ZGH.png/640px-Green_icon_-_Help.ZGH.png"
  ),

  4: new locationDetails(
    "This is four",
    4,
    "background4",
    "https://i.imgur.com/h8rBEkL.jpeg",
    "collision4",
    "https://i.imgur.com/h8rBEkL.jpeg",
    null,
    null,
    new Phaser.Math.Vector2(500, 500),
    "mapbutton4",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Green_icon_-_Help.ZGH.png/640px-Green_icon_-_Help.ZGH.png"
  ),

  5: new locationDetails(
    "This is five",
    5,
    "background5",
    "https://i.imgur.com/wiMePq5.jpeg",
    "collision5",
    "https://i.imgur.com/wiMePq5.jpeg",
    null,
    null,
    new Phaser.Math.Vector2(500, 500),
    "mapbutton5",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Green_icon_-_Help.ZGH.png/640px-Green_icon_-_Help.ZGH.png"
  ),

  6: new locationDetails(
    "This is six",
    6,
    "background6",
    "https://i.imgur.com/dyLSxir.jpeg",
    "collision6",
    "https://i.imgur.com/dyLSxir.jpeg",
    null,
    null,
    new Phaser.Math.Vector2(500, 500),
    "mapbutton6",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Konqueror-5.0.97-Deutsch%2BMen%C3%BC-Gehe_zu%2BGentoo-Linux%2BKDE-Plasma-5.18.5_2020-09-01.png/640px-Konqueror-5.0.97-Deutsch%2BMen%C3%BC-Gehe_zu%2BGentoo-Linux%2BKDE-Plasma-5.18.5_2020-09-01.png"
  ),

  7: new locationDetails(
    "This is seven",
    7,
    "background7",
    "https://i.imgur.com/YE0CjH7.jpeg",
    "collision7",
    "https://i.imgur.com/YE0CjH7.jpeg",
    null,
    null,
    new Phaser.Math.Vector2(500, 500),
    "mapbutton7",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Konqueror-5.0.97-Deutsch%2BMen%C3%BC-Gehe_zu%2BGentoo-Linux%2BKDE-Plasma-5.18.5_2020-09-01.png/640px-Konqueror-5.0.97-Deutsch%2BMen%C3%BC-Gehe_zu%2BGentoo-Linux%2BKDE-Plasma-5.18.5_2020-09-01.png"
  ),

  8: new locationDetails(
    "This is eight",
    8,
    "background8",
    "https://i.imgur.com/FiIFy3K.jpeg",
    "collision8",
    "https://i.imgur.com/FiIFy3K.jpeg",
    null,
    null,
    new Phaser.Math.Vector2(500, 500),
    "mapbutton8",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Konqueror-5.0.97-Deutsch%2BMen%C3%BC-Gehe_zu%2BGentoo-Linux%2BKDE-Plasma-5.18.5_2020-09-01.png/640px-Konqueror-5.0.97-Deutsch%2BMen%C3%BC-Gehe_zu%2BGentoo-Linux%2BKDE-Plasma-5.18.5_2020-09-01.png"
  )
};

class menuOverlay extends Phaser.Scene {
  constructor() {
    super({ key: "menuOverlay" });
  }

  preload() {
    this.load.image(
      "icon1",
      "https://static.wikia.nocookie.net/id5/images/d/d8/EntomologistPersonality.png"
    );
    this.load.image(
      "icon2",
      "https://static.wikia.nocookie.net/id5/images/d/d8/EntomologistPersonality.png"
    );
    this.load.image(
      "icon3",
      "https://static.wikia.nocookie.net/id5/images/d/d8/EntomologistPersonality.png"
    );
  }

  create() {
    // Create container to hold all menu elements
    this.menuContainer = this.add.container(0, 0);

    const graphics = this.add.graphics();
    graphics.fillStyle(0x3e9be8, 0.9);
    graphics.fillRect(0, 0, 145, this.game.config.height);
    graphics.fillStyle(0x3e9be8, 0.5);
    graphics.fillRect(0, 0, 160, this.game.config.height);
    this.menuContainer.add(graphics);

    this.registry.set("menuButtonHover", false);

    const iconYPositions = [85, 195, 305];
    const iconKeys = ["icon1", "icon2", "icon3"];
    iconKeys.forEach((key, index) => {
      const icon = this.add
        .image(75, iconYPositions[index], key)
        .setInteractive({ useHandCursor: true })
        .setScale(0.5);

      icon.on("pointerover", () => {
        this.registry.set("menuButtonHover", true);
        this.tweens.add({
          targets: icon,
          scaleX: 0.55,
          scaleY: 0.55,
          duration: 200,
          ease: "Power1"
        });
      });

      icon.on("pointerout", () => {
        this.registry.set("menuButtonHover", false);
        this.tweens.add({
          targets: icon,
          scaleX: 0.5,
          scaleY: 0.5,
          duration: 200,
          ease: "Power1"
        });
      });

      icon.on("pointerdown", () => {
        console.log(`${key} clicked`);
      });

      this.menuContainer.add(icon);
    });

    const bottomIcon = this.add
      .image(125, this.game.config.height - 120, "icon1")
      .setInteractive({ useHandCursor: true })
      .setScale(1);

    bottomIcon.on("pointerover", () => {
      this.registry.set("menuButtonHover", true);
      this.tweens.add({
        targets: bottomIcon,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 200,
        ease: "Power1"
      });
    });

    bottomIcon.on("pointerout", () => {
      this.registry.set("menuButtonHover", false);
      this.tweens.add({
        targets: bottomIcon,
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: "Power1"
      });
    });

    bottomIcon.on("pointerdown", () => {
      const mainScene = this.scene.get("MainScene");
      if (mainScene) mainScene.toggleMode();
    });

    this.menuContainer.add(bottomIcon);

    this.scene.bringToTop();
  }

  //sliding transitions
  slideOut() {
    this.tweens.add({
      targets: this.menuContainer,
      x: -300,
      duration: 400,
      ease: "Power2"
    });
  }
  slideIn() {
    this.tweens.add({
      targets: this.menuContainer,
      x: 0,
      duration: 400,
      ease: "Power2"
    });
  }
  resetPosition() {
    if (this.menuContainer) {
      this.menuContainer.x = 0;
    }
  }
}

const areaConvoSprite = {
  //i think this is right bc i dont want to make 1000 copies of this for  every areaconvo. WOW this is messy as fck i dont even know what that is
  1: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Green_icon_-_Key.ZGH.png/640px-Green_icon_-_Key.ZGH.png"
  },
  2: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Green_icon_-_Love.ZGH.png/640px-Green_icon_-_Love.ZGH.png"
  },
  3: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Green_icon_-_User.ZGH.png/640px-Green_icon_-_User.ZGH.png"
  },
  4: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Green_icon_-_Category.ZGH.png/640px-Green_icon_-_Category.ZGH.png"
  },
  5: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Green_icon_-_Star.ZGH.png/640px-Green_icon_-_Star.ZGH.png"
  },
  6: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Green_icon_-_External.ZGH.png/640px-Green_icon_-_External.ZGH.png"
  },
  7: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Green_icon_-_Lock.ZGH.png/640px-Green_icon_-_Lock.ZGH.png"
  },
  8: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Green_icon_-_Inbox.ZGH.png/640px-Green_icon_-_Inbox.ZGH.png"
  },
  9: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Green_icon_-_Search.ZGH.png/640px-Green_icon_-_Search.ZGH.png"
  },
  10: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Green_icon_-_Tabs.ZGH.png/640px-Green_icon_-_Tabs.ZGH.png"
  },
  11: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Green_icon_-_Categories.ZGH.png/640px-Green_icon_-_Categories.ZGH.png"
  },
  12: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Green_icon_-_Fast.ZGH.png/640px-Green_icon_-_Fast.ZGH.png"
  },
  13: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Green_icon_-_Home.ZGH.png/640px-Green_icon_-_Home.ZGH.png"
  },
  14: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Green_icon_-_URL.ZGH.png/640px-Green_icon_-_URL.ZGH.png"
  },
  15: {
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Green_icon_-_Flag.ZGH.png/640px-Green_icon_-_Flag.ZGH.png"
  }
};

class areaConvoObject {
  constructor(
    scene,
    position,
    targetSceneKey = "VisualNovelScene",
    sceneData = {}
  ) {
    this.scene = scene;
    this.position = position.clone();
    this.targetSceneKey = targetSceneKey;
    this.sceneData = sceneData;

    const key = "trigger-icon";

    this.createSprite(key);
    console.log(
      "scenedata passed to areaConvoObject: " + this.sceneData.meta[1]
    );
  }

  createSprite(defaultKey) {
    const spriteIDs = this.sceneData.meta?.[1] || []; //check the list passed in
    if (!Array.isArray(spriteIDs) || spriteIDs.length === 0) {
      console.warn("smth fucked up with passing scenedata so :", defaultKey);
      this.createDefaultSprite(defaultKey);
      return;
    }

    this.sprites = [];
    const loadQueue = [];

    spriteIDs.forEach((id) => {
      const spriteInfo = areaConvoSprite[id];
      const imageUrl = spriteInfo?.default;
      if (!imageUrl) {
        console.warn("areaConvoSprite doesnt have the image....???");
        return;
      }

      const dynamicKey = `sprite-${id}`;
      if (!this.scene.textures.exists(dynamicKey)) {
        this.scene.load.image(dynamicKey, imageUrl);
        loadQueue.push(dynamicKey);
      }
    });

    if (loadQueue.length > 0) {
      this.scene.load.once("complete", () => {
        this.addMultipleSprites(spriteIDs);
      });
      this.scene.load.start();
    } else {
      this.addMultipleSprites(spriteIDs);
    }
  }

  addMultipleSprites(spriteIDs) {
    const spacing = 125;
    const startX = this.position.x - ((spriteIDs.length - 1) * spacing) / 2; //@_@

    spriteIDs.forEach((id, index) => {
      const dynamicKey = `sprite-${id}`;
      if (!this.scene.textures.exists(dynamicKey)) return;

      const x = startX + index * spacing;
      const sprite = this.scene.add
        .sprite(x, this.position.y, dynamicKey)
        .setInteractive()
        .setScrollFactor(1)
        .setScale(0.3);

      //flipping
      if ((spriteIDs.length === 3 || spriteIDs.length === 4) && index < 2) {
        sprite.setFlipX(true); // first two flipped
      } else if (spriteIDs.length === 2 && index === 0) {
        sprite.setFlipX(true); // only first one flipped
      }
      //depth
      if (index === 0) {
        sprite.setDepth(20); // top layer
      } else {
        sprite.setDepth(10); // below the first
      }

      sprite.on("pointerdown", () => {
        this.triggerOverlayScene();
      });

      sprite.on("pointerover", () => {
        this.sprites.forEach((s) => {
          this.scene.tweens.killTweensOf(s);
          this.scene.tweens.add({
            targets: s,
            scaleX: 0.35,
            scaleY: 0.35,
            duration: 150,
            ease: "Power2"
          });
        });
      });

      sprite.on("pointerout", () => {
        this.sprites.forEach((s) => {
          this.scene.tweens.killTweensOf(s);
          this.scene.tweens.add({
            targets: s,
            scaleX: 0.3,
            scaleY: 0.3,
            duration: 150,
            ease: "Power2"
          });
        });
      });

      this.sprites.push(sprite);
    });
  }

  createDefaultSprite(key) {
    const sprite = this.scene.add
      .sprite(this.position.x, this.position.y, key)
      .setInteractive()
      .setDepth(10)
      .setScrollFactor(1)
      .setScale(0.5);

    sprite.on("pointerdown", () => {
      this.triggerOverlayScene();
    });

    sprite.on("pointerover", () => {
      this.scene.tweens.killTweensOf(sprite);
      this.scene.tweens.add({
        targets: sprite,
        scaleX: 0.55,
        scaleY: 0.55,
        duration: 150,
        ease: "Power2"
      });
    });

    sprite.on("pointerout", () => {
      this.scene.tweens.killTweensOf(sprite);
      this.scene.tweens.add({
        targets: sprite,
        scaleX: 0.5,
        scaleY: 0.5,
        duration: 150,
        ease: "Power2"
      });
    });

    this.sprites = [sprite];
  }

  triggerOverlayScene() {
    if (!this.scene.scene.isActive(this.targetSceneKey)) {
      console.log(`launching: ${this.targetSceneKey}`);
      console.log(`with: ${this.sceneData.convoId}`);

      this.scene.scene.pause("WorldView");
      this.scene.scene.launch(this.targetSceneKey, {
        areaConvoID: this.sceneData.convoId
      });
      this.scene.scene.bringToTop(this.targetSceneKey);
    } else {
      console.log(`visualnovelscene already active`);
    }
  }

  destroy() {
    if (this.sprites) {
      this.sprites.forEach((sprite) => sprite.destroy());
    } else {
      this.sprite?.destroy();
    }
  }
}

class VisualNovelScene extends Phaser.Scene {
  constructor() {
    super({ key: "VisualNovelScene" });

    this.dialogueIndex = 0;
    this.conversationData = [];
    this.areaConvoID = 1;

    this.csvUrl =
      "https://raw.githubusercontent.com/entomologist1/ttwopjsk/refs/heads/main/test_image.csv";

    this.sceneReady = false;
    this.reachedEnd = false;
    this.typing = false;
    this.typingTimer = null;
    this.characterSprites = {};
  }

  init(data) {
    this.areaConvoID = data.areaConvoID || 1;
  }

  preload() {
    //nvm LMAO
    this.load.image(
      "escapeButton",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Green_icon_-_Favourite.ZGH.png/640px-Green_icon_-_Favourite.ZGH.png"
    );
  }

  create() {
    // --- Scene state reset ---
    this.sceneReady = false;
    this.reachedEnd = false;
    this.dialogueIndex = 0;
    this.characterSprites = {};

    const mainScene = this.scene.get("MainScene");
    this.scene.get("menuOverlay").slideOut();

    if (!mainScene || mainScene.currentMode !== "world") {
      console.error("only open when currentMode is 'world'.");
      this.scene.stop();
      return;
    }
    this.scene.pause(mainScene);

    this.createBackground();
    this.fadeInCamera();

    //loading the convo
    this.loadCSVAndSprites(this.csvUrl, this.areaConvoID)
      .then(() => this.initializeManagers())
      .catch((err) => {
        console.error("Failed to load CSV and sprites:", err);
        this.endScene();
      });

    this.createUI();
    this.setupInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scene.resume("WorldView")
    );
    this.events.once(Phaser.Scenes.Events.DESTROY, () =>
      this.scene.resume("WorldView")
    );
  }

  createBackground() {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff)
      .setOrigin(0, 0)
      .setAlpha(0.25);

    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xcfd8fc)
      .setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  fadeInCamera() {
    this.cameras.main.setAlpha(0);
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 1,
      duration: 200,
      ease: "Linear"
    });
  }

  initializeManagers() {
    this.sceneReady = true;

    this.characterManager = new this.CharacterManager(
      this,
      this.characterSprites
    );
    this.dialogueManager = new this.DialogueManager(
      this,
      this.characterManager,
      this.conversationData
    );

    this.dialogueManager.showNextDialogue();
  }

  createUI() {
    this.favoriteButton = new this.Button(
      this,
      this.scale.width - 60,
      60,
      "escapeButton",
      100
    );

    this.favoriteButton.onClick(() => this.endScene());
  }

  setupInput() {
    this.input.on("pointerdown", () => {
      if (!this.sceneReady) return;

      if (this.dialogueManager.typing) {
        this.dialogueManager.finishTyping();
      } else if (this.dialogueManager.reachedEnd) {
        this.endScene();
      } else {
        this.dialogueManager.showNextDialogue();
      }
    });
  }

  async loadCSVAndSprites(csvUrl, areaConvoID) {
    try {
      // Fetch raw CSV
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch CSV: ${response.status} ${response.statusText}`
        );
      }
      const csvText = await response.text();

      // Parse CSV
      const rawRows = await this.parseCSV(csvText);

      // Process and filter
      const processedData = this.processRows(rawRows);
      const data = processedData.filter(
        (row) => String(row.areaConvoID) === String(areaConvoID)
      );

      if (data.length === 0) {
        throw new Error(
          `No conversation data found for areaConvoID: ${areaConvoID}`
        );
      }

      this.conversationData = data;

      // Load unique sprites
      await this.loadSprites(data);
    } catch (error) {
      console.error("Error loading CSV data:", error);
      throw error;
    }
  }

  parseCSV(csvText) {
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data)
      });
    });
  }

  processRows(rows) {
    return rows.map((row) => {
      let x = parseInt(row.x_position?.trim() || "", 10);
      let y = parseInt(row.y_position?.trim() || "", 10);

      if (isNaN(x)) {
        const pos = (row.default_position || "").toUpperCase();
        x =
          pos === "LEFT"
            ? 666
            : pos === "RIGHT"
            ? 333
            : pos === "MIDDLE"
            ? 500
            : x;
      }

      if (isNaN(y)) {
        y = 400;
      }

      return {
        areaConvoID: row.areaConvoID,
        talkspriteID: row.talkspriteID,
        speaker: row.speaker,
        dialogue: row.dialogue,
        default_position: row.default_position,
        x_position: x,
        y_position: y,
        quick_escape: row.quick_escape,
        quick_enter: row.quick_enter,
        animation: row.animation
      };
    });
  }

  loadSprites(data) {
    return new Promise((resolve) => {
      const uniqueUrls = new Set();

      data.forEach((convo) => {
        const imageUrl = convo.talkspriteID;
        const key = `sprite_${imageUrl}`;
        convo.imageKey = key;

        if (!uniqueUrls.has(imageUrl)) {
          uniqueUrls.add(imageUrl);
          this.load.image(key, imageUrl);
        }
      });

      this.load.once("complete", resolve);
      this.load.start();
    });
  }

  endScene() {
    //fadeout
    this.cameras.main.setAlpha(1);
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 0,
      duration: 100, // milliseconds
      ease: "Linear",
      onComplete: () => {
        //cleanup lol
        this.scene.resume("MainScene"); //idk why its being difficult but whtaever
        this.scene.get("menuOverlay").slideIn();
        this.scene.stop();
      }
    });
  }

  Button = class {
    constructor(scene, x, y, key, size = 100) {
      this.scene = scene;
      this.size = size;

      const texture = scene.textures.get(key);
      const image = texture.getSourceImage();
      const scale = Math.min(size / image.width, size / image.height);

      this.sprite = scene.add
        .sprite(x, y, key)
        .setScale(scale)
        .setInteractive({ useHandCursor: true });

      this.baseScale = scale;
      this.currentTween = null;

      this.setupHoverTweens();
    }

    setupHoverTweens() {
      this.sprite.on("pointerover", () => {
        if (this.currentTween) this.currentTween.stop();
        this.currentTween = this.scene.tweens.add({
          targets: this.sprite,
          scaleX: this.baseScale * 1.05,
          scaleY: this.baseScale * 1.05,
          duration: 200,
          ease: "Power2"
        });
      });

      this.sprite.on("pointerout", () => {
        if (this.currentTween) this.currentTween.stop();
        this.currentTween = this.scene.tweens.add({
          targets: this.sprite,
          scaleX: this.baseScale,
          scaleY: this.baseScale,
          duration: 200,
          ease: "Power2"
        });
      });
    }

    onClick(callback) {
      this.sprite.on("pointerup", callback);
    }

    destroy() {
      this.sprite.destroy();
    }
  };

  CharacterManager = class {
    //DO NOT DO ANYTHING WITH SCALE EVER
    constructor(scene, characterSprites) {
      this.scene = scene;
      this.characterSprites = characterSprites;
    }

    moveOrCreateCharacter(current) {
      const key = current.imageKey;
      const newX = current.x_position;
      const newY = current.y_position;
      let sprite = this.characterSprites[key];

      if (!sprite) {
        //create chara
        sprite = this.scene.add.sprite(newX, newY, key);
        this.fitSpriteToBounds(sprite, 300, 300);
        this.characterSprites[key] = sprite;
      } else {
        //chara already exists so just update
        sprite.setAngle(0); //i cant use resetSprite for this bc the tween overrides animation which is like whatever
        sprite.setAlpha(1);
        if (!sprite.visible) {
          sprite.setVisible(true).setAlpha(1);
        }

        const positionChanged = sprite.x !== newX || sprite.y !== newY;
        if (positionChanged) {
          this.scene.tweens.add({
            targets: sprite,
            x: newX,
            y: newY,
            duration: 400,
            ease: "Power2"
          });
          this.playAnimation(sprite, current.animation.toUpperCase()); //DEBUG im throwing stuff at walls here just remove this if its annoying
        } else {
          // NEW: play animation if specified, otherwise bounce
          if (current.animation) {
            this.playAnimation(sprite, current.animation.toUpperCase());
          } else {
            this.scene.tweens.add({
              targets: sprite,
              y: sprite.y - 20,
              duration: 150,
              ease: "Quad.easeOut",
              yoyo: true
            });
          }
        }
      }

      return sprite;
    }

    //TODO edit animations
    playAnimation(sprite, animation) {
      console.log("animation: " + animation);
      switch (animation) {
        case "SHAKE":
          this.scene.tweens.add({
            targets: sprite,
            x: sprite.x + 10,
            duration: 50,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: 3
          });
          break;

        case "SCALE":
          this.scene.tweens.add({
            targets: sprite,
            scaleX: sprite.scaleX * 1.2,
            scaleY: sprite.scaleY * 1.2,
            duration: 150,
            yoyo: true,
            ease: "Power2"
          });
          break;

        case "FADE":
          this.scene.tweens.add({
            targets: sprite,
            alpha: 0.5,
            duration: 200,
            yoyo: true,
            ease: "Quad.easeInOut"
          });
          break;

        case "NUDGE_LEFT":
          this.scene.tweens.add({
            targets: sprite,
            x: sprite.x - 15,
            angle: sprite.angle - 10,
            duration: 150,
            ease: "Power2"
          });
          break;

        case "NUDGE_RIGHT":
          this.scene.tweens.add({
            targets: sprite,
            x: sprite.x + 15,
            angle: sprite.angle + 10,
            duration: 150,
            ease: "Power2"
          });
          break;

        case "RESET_NOW": //hehe retry now
          this.resetSpriteState(sprite);
          break;

        default:
          //whatever LMAO
          break;
      }
    }

    handleQuickEscape(sprite, direction) {
      if (!sprite) return;

      const sceneWidth = this.scene.scale.width;
      let targetX =
        direction === "RIGHT"
          ? sceneWidth + sprite.displayWidth
          : direction === "LEFT"
          ? -sprite.displayWidth
          : sprite.x;

      this.scene.tweens.add({
        targets: sprite,
        x: targetX,
        alpha: 0,
        duration: 500,
        ease: "Power2",
        onComplete: () => {
          for (const key in this.characterSprites) {
            if (this.characterSprites[key] === sprite) {
              delete this.characterSprites[key];
              break;
            }
          }
          sprite.destroy();
        }
      });
    }

    handleQuickEnter(sprite, direction) {
      if (!sprite) return;

      const sceneWidth = this.scene.scale.width;
      const targetX = sprite.x;
      let startX =
        direction === "LEFT"
          ? -sprite.displayWidth
          : direction === "RIGHT"
          ? sceneWidth + sprite.displayWidth
          : sprite.x;

      sprite.x = startX;
      sprite.alpha = 0;
      sprite.setVisible(true);

      this.scene.tweens.add({
        targets: sprite,
        x: targetX,
        alpha: 1,
        duration: 500,
        ease: "Power1"
      });
    }

    fitSpriteToBounds(sprite, maxWidth, maxHeight) {
      const scale = Math.min(
        maxWidth / sprite.width,
        maxHeight / sprite.height
      );
      sprite.setScale(scale);
    }

    resetSpriteState(sprite) {
      this.scene.tweens.add({
        targets: sprite,
        angle: 0,
        alpha: 1,
        duration: 300,
        ease: "Power2"
      });
    }
  };

  DialogueManager = class {
    constructor(scene, characterManager, conversationData) {
      this.scene = scene;
      this.characterManager = characterManager;
      this.conversationData = conversationData;

      this.dialogueIndex = 0;
      this.reachedEnd = false;
      this.typing = false;
      this.typingTimer = null;

      this.setupUI();
    }

    setupUI() {
      const boxX = 75;
      const boxY = this.scene.scale.height - 200;
      const boxHeight = this.scene.scale.height - 425;
      const boxWidth = this.scene.scale.width - 125;
      const cornerRadius = 20;

      this.textbox = this.scene.add.graphics();

      //fill
      this.textbox.fillStyle(0xd9fbfc, 0.9);
      this.textbox.fillRoundedRect(
        boxX,
        boxY,
        boxWidth,
        boxHeight,
        cornerRadius
      );

      this.textbox.lineStyle(6, 0xffffff, 1);
      this.textbox.strokeRoundedRect(
        boxX,
        boxY,
        boxWidth,
        boxHeight,
        cornerRadius
      );

      this.speakerText = this.scene.add.text(boxX + 30, boxY - 30, "", {
        font: "50px Arial",
        fill: "#000000",
        fontStyle: "bold",
        stroke: "#ffffff",
        strokeThickness: 5
      });

      this.dialogueText = this.scene.add.text(boxX + 50, boxY + 40, "", {
        font: "27px Arial",
        fill: "#000000",
        wordWrap: { width: 720 }
      });

      this.uiContainer = this.scene.add.container(0, 0, [
        this.textbox,
        this.speakerText,
        this.dialogueText
      ]);
    }

    showNextDialogue() {
      const current = this.conversationData[this.dialogueIndex];
      if (!current) {
        this.reachedEnd = true;
        return;
      }

      const sprite = this.characterManager.moveOrCreateCharacter(current);

      if (current.quick_enter) {
        this.characterManager.handleQuickEnter(
          sprite,
          current.quick_enter.toUpperCase()
        );
      }

      if (current.quick_escape) {
        this.scene.time.delayedCall(300, () => {
          this.characterManager.handleQuickEscape(
            sprite,
            current.quick_escape.toUpperCase()
          );
        });
      }

      if (!current.dialogue || current.dialogue.trim() === "") {
        if (current.quick_escape) {
          this.characterManager.handleQuickEscape(
            sprite,
            current.quick_escape.toUpperCase()
          );
        }
        this.dialogueIndex++;
        this.showNextDialogue();
        return;
      }

      const speakerName = current.speaker ? current.speaker + ":" : "";
      this.speakerText.setText(speakerName);

      this.scene.children.bringToTop(sprite);
      this.scene.children.bringToTop(this.uiContainer);

      this.typeText(current.dialogue, () => {});
      this.dialogueIndex++;

      if (this.dialogueIndex >= this.conversationData.length) {
        this.reachedEnd = true;
      }
    }

    typeText(fullText, onComplete) {
      this.typing = true;
      this.dialogueText.setText("");
      let i = 0;

      this.typingTimer = this.scene.time.addEvent({
        delay: 30,
        repeat: fullText.length - 1,
        callback: () => {
          if (!this.typing) {
            if (this.typingTimer) {
              this.typingTimer.remove(false);
              this.typingTimer = null;
            }
            if (onComplete) onComplete();
            return;
          }

          this.dialogueText.setText(fullText.substring(0, i + 1));
          i++;

          if (i >= fullText.length) {
            this.typing = false;
            this.typingTimer = null;
            if (onComplete) onComplete();
          }
        }
      });
    }

    finishTyping() {
      const current = this.conversationData[this.dialogueIndex - 1];
      if (!current) return;

      this.typing = false;
      if (this.typingTimer) {
        this.typingTimer.remove(false);
      }
      this.dialogueText.setText(current.dialogue);
    }
  };
}

const config = {
  type: Phaser.AUTO,
  backgroundColor: "#222",
  parent: "phaser-example",
  physics: {
    default: "arcade",
    arcade: {
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    width: 1000,
    height: 600
  },
  scene: [MainScene, menuOverlay, VisualNovelScene]
};

const game = new Phaser.Game(config);

class ErrorScene extends Phaser.Scene {
  constructor() {
    super({ key: "ErrorScene" });
  }

  init(data) {
    this.errorMessage = data.message || "Unknown error occurred.";
  }

  create() {
    const { width, height } = this.scale;

    const allScenes = this.scene.manager.getScenes(true); // currently running scenes
    allScenes.forEach((scene) => {
      if (scene.scene.key !== this.scene.key) {
        this.scene.pause(scene.scene.key);
        this.scene.setVisible(false, scene.scene.key);
      }
    });

    this.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0);
    this.add
      .text(width / 2, height / 2 - 20, "oh no", {
        font: "32px Arial",
        fill: "#ff4444"
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 20, this.errorMessage, {
        font: "20px Arial",
        fill: "#ffffff",
        wordWrap: { width: width - 100 }
      })
      .setOrigin(0.5);

    const restartText = this.add
      .text(width / 2, height / 2 + 80, "try again?", {
        font: "22px Arial",
        fill: "#00ff00",
        backgroundColor: "#222",
        padding: { left: 10, right: 10, top: 5, bottom: 5 }
      })
      .setOrigin(0.5)
      .setInteractive();

    restartText.on("pointerdown", () => {
      this.scene.start("MainScene"); // restart attempt
    });
  }
}


