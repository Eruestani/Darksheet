import { ActorSheet5eCharacter } from '../../../../modules/darksheet/actor/sheets/character.js';
import { Actor5e } from '../../../../modules/darksheet/actor/entity.js';

Hooks.once('init', () => loadTemplates([
  'modules/darksheet/templates/actors/parts/actor-inventory.html',
  'modules/darksheet/templates/actors/parts/actor-spellbook.html',
  'modules/darksheet/templates/items/parts/item-description.html'
]));
Hooks.once('init', function() {
    Actors.registerSheet('dnd5e', DarkSheet, {
        types: ['character']
    });
	Items.registerSheet('dnd5e', DarkItemSheet5e);
	game.settings.register('darksheet', 'slotbasedinventory', {
      name: 'Slot based inventory',
      hint: 'This option determines on which value the bar at the bottom of the inventory uses, if his is enabled it will use slots instead of weight.',
      scope: 'world',
      config: true,
      default: true,
      type: Boolean,
    });
});
export const _getInitiativeFormula = function(combatant) {
  const actor = combatant.actor;
  if ( !actor ) return "1d20";
  const init = actor.data.data.attributes.init;
  const parts = ["1d20", init.mod, (init.prof !== 0) ? init.prof : null, (init.bonus !== 0) ? init.bonus : null];
  if ( actor.getFlag("dnd5e", "initiativeAdv") ) parts[0] = "2d20kh";
  if ( CONFIG.initiative.tiebreaker ) parts.push(actor.data.data.abilities.int.value / 100);
  return parts.filter(p => p !== null).join(" + ");
};
/**
 * Override and extend the core ItemSheet implementation to handle D&D5E specific item types
 * @type {ItemSheet}
 */
export class DarkItemSheet5e extends ItemSheet {
  constructor(...args) {
    super(...args);

    /**
     * The tab being browsed
     * @type {string}
     */
    this._sheetTab = null;

    /**
     * The scroll position on the active tab
     * @type {number}
     */
    this._scrollTab = 100;
  }

  /* -------------------------------------------- */

	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
      width: 560,
      height: 420,
      classes: ["dnd5e", "sheet", "item"],
      resizable: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Return a dynamic reference to the HTML template path used to render this Item Sheet
   * @return {string}
   */
  get template() {
    const path = "modules/darksheet/templates/items/";
    return `${path}/${this.item.data.type}.html`;
  }

  /* -------------------------------------------- */

  /* -------------------------------------------- */
  
  /**
   * Prepare item sheet data
   * Start with the base item data and extending with additional properties for rendering.
   */
  getData() {
    const data = super.getData();
    data.labels = this.item.labels;

    // Include CONFIG values
    data.config = CONFIG.DND5E;

    // Item Type, Status, and Details
    data.itemType = data.item.type.titleCase();
    data.itemStatus = this._getItemStatus(data.item);
    data.itemProperties = this._getItemProperties(data.item);
    data.isPhysical = data.item.data.hasOwnProperty("quantity");

    // Action Details
    data.hasAttackRoll = this.item.hasAttack;
    data.isHealing = data.item.data.actionType === "heal";
    data.isFlatDC = getProperty(data.item.data, "save.scaling") === "flat";
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Get the text item status which is shown beneath the Item type in the top-right corner of the sheet
   * @return {string}
   * @private
   */
  _getItemStatus(item) {
    if ( item.type === "spell" ) return item.data.preparation.prepared ? "Prepared" : "Unprepared";
    else if ( ["weapon", "equipment"].includes(item.type) ) return item.data.equipped ? "Equipped" : "Unequipped";
    else if ( item.type === "tool" ) return item.data.proficient ? "Proficient" : "Not Proficient";
  }

  /* -------------------------------------------- */

  /**
   * Get the Array of item properties which are used in the small sidebar of the description tab
   * @return {Array}
   * @private
   */
  _getItemProperties(item) {
    const props = [];
    const labels = this.item.labels;

    if ( item.type === "weapon" ) {
      props.push(...Object.entries(item.data.properties)
        .filter(e => e[1] === true)
        .map(e => CONFIG.DND5E.weaponProperties[e[0]]));
    }

    else if ( item.type === "spell" ) {
      props.push(
        labels.components,
        labels.materials,
        item.data.components.concentration ? "Concentration" : null,
        item.data.components.ritual ? "Ritual" : null
      )
    }

    else if ( item.type === "equipment" ) {
      props.push(CONFIG.DND5E.equipmentTypes[item.data.armor.type]);
      props.push(labels.armor);
    }

    else if ( item.type === "feat" ) {
      props.push(labels.featType);
    }

    // Action type
    if ( item.data.actionType ) {
      props.push(CONFIG.DND5E.itemActionTypes[item.data.actionType]);
    }

    // Action usage
    if ( (item.type !== "weapon") && item.data.activation && !isObjectEmpty(item.data.activation) ) {
      props.push(
        labels.activation,
        labels.range,
        labels.target,
        labels.duration
      )
    }
    return props.filter(p => !!p);
  }

  /* -------------------------------------------- */

  setPosition(position={}) {
    if ( this._sheetTab === "details" ) position.height = "auto";
    return super.setPosition(position);
  }

  /* -------------------------------------------- */
  /*  Form Submission                             */
	/* -------------------------------------------- */

  /**
   * Extend the parent class _updateObject method to ensure that damage ends up in an Array
   * @private
   */
  _updateObject(event, formData) {

    // Handle Damage Array
    let damage = Object.entries(formData).filter(e => e[0].startsWith("data.damage.parts"));
    formData["data.damage.parts"] = damage.reduce((arr, entry) => {
      let [i, j] = entry[0].split(".").slice(3);
      if ( !arr[i] ) arr[i] = [];
      arr[i][j] = entry[1];
      return arr;
    }, []);

    // Update the Item
    super._updateObject(event, formData);
  }

  /* -------------------------------------------- */

  /**
   * Activate listeners for interactive item sheet events
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Activate tabs
    new Tabs(html.find(".tabs"), {
      initial: this["_sheetTab"],
      callback: clicked => {
        this["_sheetTab"] = clicked.data("tab");
        this.setPosition();
      }
    });

    // Save scroll position
    html.find(".tab.active")[0].scrollTop = this._scrollTab;
    html.find(".tab").scroll(ev => this._scrollTab = ev.currentTarget.scrollTop);

    // Modify damage formula
    html.find(".damage-control").click(this._onDamageControl.bind(this));
  }
	
  /* -------------------------------------------- */

  /**
   * Add or remove a damage part from the damage formula
   * @param {Event} event     The original click event
   * @return {Promise}
   * @private
   */
  async _onDamageControl(event) {
    event.preventDefault();
    const a = event.currentTarget;
	
    // Add new damage component
    if ( a.classList.contains("add-damage") ) {
      await this._onSubmit(event);  // Submit any unsaved changes
      const damage = this.item.data.data.damage;
      return this.item.update({"data.damage.parts": damage.parts.concat([["", ""]])});
    }

    // Remove a damage component
    if ( a.classList.contains("delete-damage") ) {
      await this._onSubmit(event);  // Submit any unsaved changes
      const li = a.closest(".damage-part");
      const damage = duplicate(this.item.data.data.damage);
      damage.parts.splice(Number(li.dataset.damagePart), 1);
      return this.item.update({"data.damage.parts": damage.parts});
    }
  }
}

export class DarkSheet extends ActorSheet5eCharacter {
    get template() {
        return 'modules/darksheet/templates/character-sheet.html';
    }
    activateListeners(html) {
        super.activateListeners(html);
		
	html.find('.exhaustioncalc').click(event => {
      event.preventDefault();
		  let newexhaustion = 0;
		  let temp = this.actor.data.data.attributes.temp;
		  let food = this.actor.data.data.attributes.saturation.value;
		  let water = this.actor.data.data.attributes.thirst.value;
		  let fatigue = this.actor.data.data.attributes.fatigue.value;
		  let manualexhaustion = this.actor.data.data.attributes.exhaustionpoints.value;
		  //Temperature Exhaustion
		  if(temp === "exenegised"){
		  newexhaustion += -1;
		  }
		  else if(temp === "exvsleepy" || temp === "exbarely"){
		  newexhaustion += 1;
		  }
		  //Food Exhaustion
		  if(food === "foodstuffed"){
		  newexhaustion += -1;
		  }
		  else if(food === "foodravenous" || food === "foodstarving"){
		  newexhaustion += 1;
		  }
		  //Water Exhaustion
		  if(water === "wquenched"){
		  newexhaustion += -1;
		  }
		  else if(water === "wdry" || water === "wdehydrated"){
		  newexhaustion += 1;
		  }
		  //Fatigue Exhaustion
		  if(fatigue === "exenegised"){
		  newexhaustion += -1;
		  }
		  else if(fatigue === "exvsleepy" || fatigue === "exbarely"){
		  newexhaustion += 1;
		  }
		  //exhaustion over 3?
		  if(newexhaustion >= 4){
		  console.log("(DarkSheet): Maximum exhaustion achieved through needs. Total exhaustion from fron needs cannot exceed 3");
		  newexhaustion = 3;
		  }
		  //adding manual exhaustion
		  newexhaustion = (newexhaustion * 1 + manualexhaustion * 1);
		  //exhaustion <0?
		  if(newexhaustion <= 0){
		  newexhaustion = 0;
		  }
		  this.actor.data.data.attributes.newexhaustion = newexhaustion;
		  console.log("(DarkSheet): New Exhaustion: "+this.actor.data.data.attributes.newexhaustion);
		  this.render();
		});	
		
		/*RICH TEXT EDITOR CUSTOM CSS*/
		window.createEditor = (function () {
		const cached = window.createEditor;
		return function () {
        arguments[0].content_css = 'css/mce.css,modules/darksheet/css/darksheet-mce.css';
        return cached.apply(this, arguments);
		};
		})();
		/*END RICH TEXT EDITOR CUSTOM CSS END*/
	
		/*LOOK FOR AMMODIE*/
	html.find('.ammodice').click(event => {
		event.preventDefault();

		// Rolling table, from best to worst
		const rollings = ['d12','d10','d8','d6','d4','d2','1', ''];

		// Getting item
		let item = this.actor.getOwnedItem(Number($(event.currentTarget).parents('[data-item-id]').attr("data-item-id")));

		// Seeting and creating chatMessage
		let title = `${this.actor.data.name} roll his ammodice for ${item.data.name}`;
		let roll = new Roll('@ammodie', {ammodie : item.data.data.ammodie}).roll();
		let rollMode = game.settings.get("core", "rollMode");
		if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
		roll.toMessage({
			speaker: ChatMessage.getSpeaker({actor: this}),
			flavor: title,
			rollMode: rollMode
		});

		// If Epic fail
		if(roll.result == "1")
		{
			// Lower ammodie rank
			const new_ammodie = rollings.indexOf(item.data.data.ammodie) + 1;
			if(new_ammodie < rollings.length)
			{
				this.actor.updateOwnedItem({id: item.data.id, 'data.ammodie': rollings[new_ammodie]});
			}
		}
	});

/*LOOK FOR Stresscheckbox*/
	html.find('.stressroll').click(event => {
      event.preventDefault();
	  
			// Rolling table, from best to worst
			let table = game.tables.entities.find(t => t.data.name === "Afflictions"); table.draw();
			const result = table.roll()
			
			let content = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3 style=" color: #fff;">Affliction</h3>
					<h3>${roll.result}</h3>
					</header>
				</div>`;
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			ChatMessage.create({
				user: game.user._id,
				content: content,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'bad'}}
			});

    });	
	
	/*LOOK FOR BURNOUTDIE*/
	html.find('.burnoutdie').click(event => {
      event.preventDefault();
	  
			// Rolling table, from best to worst
			const rollings = ['12','10','8','6','4'];
			// Value of the burnoutdice
			let burnoutdie = this.actor.data.data.attributes.burnout.value;
			// find the table
			let table = game.tables.entities.find(t => t.data.name === "Burnout Consequence");
			// burnoutsettings
			let bsettings = this.actor.data.data.attributes.burnoutc.value
			// magic region
			var regionmod = parseInt(this.actor.data.data.attributes.regionmod.value, 10);
			//console.log("Regionmod: "+regionmod);
			// burnoutdice changed through region
			if (regionmod < 0){
				var regionmodz = rollings.indexOf(this.actor.data.data.attributes.burnout.value) - parseInt(regionmod);
				//console.log("Regionmodz step2 kleiner: "+regionmodz);
				if (regionmodz >= 5){
					regionmodz = 4;
				}
			}
			else{
				var regionmodz = rollings.indexOf(this.actor.data.data.attributes.burnout.value) - parseInt(regionmod);
				//console.log("Regionmodz step3 gr��er: "+regionmodz);
				if (regionmodz <= 0){
					regionmodz = 0;
				}
			}
			var burnoutARegion = rollings[regionmodz];
			let rollcon = burnoutARegion;
			let rollcona = "d" + rollcon
			let roll = new Roll(`${rollcona}`).roll();
			const result = table.roll()
			
			
			
			if (burnoutdie === 0){}
			else{
			let content = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Burnoutdice(${rollcona}): </h3>
					<h3>${roll.result}</h3>
					</header>
				</div>`;
			let content2 = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Burnoutdice(${rollcona}): </h3>
					<h3 style="color: #ff0000;text-shadow: 0 0 2px;">${roll.result}</h3>
					</header>
					</br>
					<h3 style="color: #ff0000;text-shadow: 0 0 2px; text-align: center;">${result[1].text}</h3>
				</div>`;
			let content3 = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Burnoutdice(${rollcona}): </h3>
					<h3 style="color: #ff0000;text-shadow: 0 0 2px;">${roll.result}</h3>
					</header>
				</div>`;
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			if(roll.result <= 2)
			{
			    if(bsettings){
					ChatMessage.create({
						user: game.user._id,
						content: content2,
						speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
						whisper: ChatMessage.getWhisperIDs("GM"),
						sound: CONFIG.sounds.dice,
						flags: {darksheet: {outcome: 'bad'}}
					});
				}
				else{
					ChatMessage.create({
						user: game.user._id,
						content: content3,
						speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
						whisper: ChatMessage.getWhisperIDs("GM"),
						sound: CONFIG.sounds.dice,
						flags: {darksheet: {outcome: 'bad'}}
					});
				}
				// Lower burnoutdie rank
				const new_burnoutdie = rollings.indexOf(this.actor.data.data.attributes.burnout.value) + 1;
				if(new_burnoutdie < rollings.length)
				{
					this.actor.data.data.attributes.burnout.value = rollings[new_burnoutdie];
				}
				this.render();

			}
			else
			{
			ChatMessage.create({
				user: game.user._id,
				content: content,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				sound: CONFIG.sounds.dice
			});
			} 
			}
    });	
	html.find('.foodcheckbox').change(event => {
	console.log("(DarkSheet): Food Value Changed");

	});	
	//AUTOMATIC EXHAUSTION CALCULATION
	html.find('.exhaustioncalc').click(event => {
      event.preventDefault();
		  let newexhaustion = 0;
		  let temp = this.actor.data.data.attributes.temp;
		  let food = this.actor.data.data.attributes.saturation.value;
		  let water = this.actor.data.data.attributes.thirst.value;
		  let fatigue = this.actor.data.data.attributes.fatigue.value;
		  let manualexhaustion = this.actor.data.data.attributes.exhaustionpoints.value;
		  //Temperature Exhaustion
		  if(temp === "exenegised"){
		  newexhaustion += -1;
		  }
		  else if(temp === "exvsleepy" || temp === "exbarely"){
		  newexhaustion += 1;
		  }
		  //Food Exhaustion
		  if(food === "foodstuffed"){
		  newexhaustion += -1;
		  }
		  else if(food === "foodravenous" || food === "foodstarving"){
		  newexhaustion += 1;
		  }
		  //Water Exhaustion
		  if(water === "wquenched"){
		  newexhaustion += -1;
		  }
		  else if(water === "wdry" || water === "wdehydrated"){
		  newexhaustion += 1;
		  }
		  //Fatigue Exhaustion
		  if(fatigue === "exenegised"){
		  newexhaustion += -1;
		  }
		  else if(fatigue === "exvsleepy" || fatigue === "exbarely"){
		  newexhaustion += 1;
		  }
		  //exhaustion over 3?
		  if(newexhaustion >= 4){
		  console.log("(DarkSheet): Maximum exhaustion achieved through needs. Total exhaustion from fron needs cannot exceed 3");
		  newexhaustion = 3;
		  }
		  //adding manual exhaustion
		  newexhaustion = (newexhaustion * 1 + manualexhaustion * 1);
		  //exhaustion <0?
		  if(newexhaustion <= 0){
		  newexhaustion = 0;
		  }
		  this.actor.data.data.attributes.newexhaustion = newexhaustion;
		  console.log("(DarkSheet): New Exhaustion: "+this.actor.data.data.attributes.newexhaustion);
		  this.render();
    });	

	
	html.find('.staminacheck').click(event => {
      event.preventDefault();
	  
			// Rolling table, from best to worst
			let roll = new Roll(`1d6`).roll();
			let content= `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3 style=" color: Orange; margin-top: 7px;">Stamina Check</h3>
					<h3 style= "color: #fff; margin-top: 7px;"> +1 Hunger</h3>
					</header>
				</div>`;
			let content2 = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3 style=" color: Orange; margin-top: 7px;">Stamina Check</h3>
					<h3 style= "color: #fff; margin-top: 7px;">+1 Thirst</h3>
					</header>
				</div>`;
			let content3 = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3 style=" color: Orange; margin-top: 7px;">Stamina Check</h3>
					<h3 style= "color: #fff; margin-top: 7px;">+1 Fatigue</h3>
					</header>
				</div>`;
			// Send content to chat
			let rollWhisper = false;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			if(roll.result <= 2)
			{
				ChatMessage.create({
					user: game.user._id,
					content: content,
					speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
					whisper: ChatMessage.getWhisperIDs("GM"),
					blind: rollBlind,
					sound: CONFIG.sounds.dice,
					flags: {darksheet: {outcome: 'bad'}}
				});
			}
			else if(roll.result <= 4)
			{
				ChatMessage.create({
					user: game.user._id,
					content: content2,
					speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
					whisper: ChatMessage.getWhisperIDs("GM"),
					blind: rollBlind,
					sound: CONFIG.sounds.dice,
					flags: {darksheet: {outcome: 'bad'}}
				});
			}
			else
			{
				ChatMessage.create({
					user: game.user._id,
					content: content3,
					speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
					whisper: ChatMessage.getWhisperIDs("GM"),
					blind: rollBlind,
					sound: CONFIG.sounds.dice,
					flags: {darksheet: {outcome: 'bad'}}
				});
			}
    });	
	
	html.find('.exhaustionstatus').click(event => {
      event.preventDefault();
		let exhaustion = this.actor.data.data.attributes.newexhaustion;
		let newexhaustion = this.actor.data.data.attributes.newexhaustion;
			let content = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Exhaustion 1</h3>
					</header>
					</br>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Disadvantage on Ability Checks</h3>
				</div>`;
			let content2 = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Exhaustion 2</h3>
					</header>
					</br>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Disadvantage on Ability Checks</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Speed halved</h3>
				</div>`;
			let content3 = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Exhaustion 3</h3>
					</header>
					</br>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Disadvantage on Ability Checks</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Speed halved</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Disadvantage on Attack rolls and Saving Throws</h3>
				</div>`;
			let content4 = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Exhaustion 4</h3>
					</header>
					</br>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Disadvantage on Ability Checks</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Speed halved</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Disadvantage on Attack rolls and Saving Throws</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Hit point maximum halved</h3>
				</div>`;
			let content5 = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Exhaustion 5</h3>
					</header>
					</br>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Disadvantage on Ability Checks</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Speed halved</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Disadvantage on Attack rolls and Saving Throws</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Hit point maximum halved</h3>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Speed reduced to 0</h3>
				</div>`;
			let content6 = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Exhaustion 6</h3>
					</header>
					</br>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">Death</h3>
				</div>`;
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			
			if(newexhaustion === 1){
			ChatMessage.create({
				user: game.user._id,
				content: content,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'table'}}
			});
			}
			else if(newexhaustion === 2){
			ChatMessage.create({
				user: game.user._id,
				content: content2,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'table'}}
			});
			}
			else if(newexhaustion === 3){
			ChatMessage.create({
				user: game.user._id,
				content: content3,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'bad'}}
			});
			}
			else if(newexhaustion === 4){
			ChatMessage.create({
				user: game.user._id,
				content: content4,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'bad'}}
			});
			}
			else if(newexhaustion === 5){
			ChatMessage.create({
				user: game.user._id,
				content: content5,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'bad'}}
			});
			}
			else if(newexhaustion === 6){
			ChatMessage.create({
				user: game.user._id,
				content: content6,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'bad'}}
			});
			}
    });	
	
	html.find('.deathsaveroll').click(event => {
      event.preventDefault();
	  let table = game.tables.entities.find(t => t.data.name === "Death Saving Throw");
	  const result = table.roll()
			let content = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Death Saving Throw</h3>
					</header>
					</br>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">${result[1].text}</h3>
				</div>`;
			
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			
			ChatMessage.create({
				user: game.user._id,
				content: content,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'bad'}}
			});
    });	
	

	// LOOK FOR WOUNDROLL
	html.find('.woundroll').click(event => {
      event.preventDefault();
	  let table = game.tables.entities.find(t => t.data.name === "Reopening Wounds");
	  const result = table.roll()
			let content = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Woundroll</h3>
					</header>
					</br>
					<h3 style="text-shadow: 0 0 0px; text-align: center;">${result[1].text}</h3>
				</div>`;
			
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			
			ChatMessage.create({
				user: game.user._id,
				content: content,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'table'}}
			});
    });
	html.find('.treatwound').click(event => {
      event.preventDefault();
	  let table = game.tables.entities.find(t => t.data.name === "Treatwounds"); table.draw();
	  const result = table.roll()
			let content = `
					<h3 style="text-shadow: 0 0 4px; text-align: center;">${result[1].text}</h3>
				</div>`;
			
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			
			ChatMessage.create({
				user: game.user._id,
				content: content,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'table'}}
			});
    });
	
	html.find('.healwound').click(event => {
      event.preventDefault();
			let conmod = this.actor.data.data.abilities.con.mod;
            let roll1 = new Roll(`1d20`).roll().total;
			let rolltotal = roll1 + conmod;
			let content = `
			<div class="messagecards">
			<b style=" color: #9dff00; margin-left: 17%;text-shadow: 0 0 0px;">Wound Heal (Long Rest) DC 15:</b> <br><i>
					<h4 style="text-shadow: 0 0 0px; text-align: center;"> You rolled a  <b style="color:#9dff00; font-style: normal;">${rolltotal}</b> <a style="color: gray; font-style: normal;">(${roll1}+${conmod})</a> and your wound healed.</h4>
				</div>
			</div>
			`;
			let content2 = `
			<div class="messagecards">
			<b style="color: #ff0000; margin-left: 17%;text-shadow: 0 0 1px;">Wound Heal (Long Rest) DC 15:</b> <br><i>
					<h4 style="text-shadow: 0 0 1px; text-align: center;"> You rolled a  <b style="color:red; font-style: normal;">${rolltotal}</b> <a style="color: gray; font-style: normal;">(${roll1}+${conmod})</a> and your wound did not heal.</h4>
				</div>
			</div>
			`;
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			if(roll1 >= 15){
				ChatMessage.create({
					user: game.user._id,
					content: content,
					speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
					whisper: ChatMessage.getWhisperIDs("GM"),
					blind: rollBlind,
					sound: CONFIG.sounds.dice,
					flags: {darksheet: {outcome: 'good'}}
				});
				
			}
			else{
				ChatMessage.create({
					user: game.user._id,
					content: content2,
					speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
					whisper: ChatMessage.getWhisperIDs("GM"),
					blind: rollBlind,
					sound: CONFIG.sounds.dice,
					flags: {darksheet: {outcome: 'bad'}}
				});
			}
    });	
	html.find('.criticalS').click(event => {
      event.preventDefault();
	  let table = game.tables.entities.find(t => t.data.name === "Boons"); table.draw();
	  const result = table.roll()
			let content = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<h3 style="text-shadow: 0 0 1px; text-align: center;">${result[1].text}</h3>
				</div>`;
			
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			
			ChatMessage.create({
				user: game.user._id,
				content: content,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'good'}}
			});
    });
	html.find('.criticalF').click(event => {
      event.preventDefault();
	  let table = game.tables.entities.find(t => t.data.name === "Consequences"); table.draw();
	  const result = table.roll()
			let content = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<h3 style="text-shadow: 0 0 1px; text-align: center;">${result[1].text}</h3>
				</div>`;
			
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			
			ChatMessage.create({
				user: game.user._id,
				content: content,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'bad'}}
			});
    });
	html.find('.successatcost').click(event => {
      event.preventDefault();
	  let table = game.tables.entities.find(t => t.data.name === "Success at a Cost - Offerings"); table.draw();
	  const result = table.roll()
			let content = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<h3 style="text-shadow: 0 0 0px; text-align: center;">${result[1].text}</h3>
				</div>`;
			
			// Send content to chat
			let rollWhisper = null;
			let rollBlind = false;			
			let	rollMode = game.settings.get("core", "rollMode");
			if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
			if (rollMode === "blindroll") rollBlind = true;
			
			ChatMessage.create({
				user: game.user._id,
				content: content,
				speaker: { actor: this.actor._id, token: this.actor.token, alias: this.actor.name },
				whisper: ChatMessage.getWhisperIDs("GM"),
				blind: rollBlind,
				sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'table'}}
			});
    });	
	
	        html.find('.hitdiceroll').click(event => {
            event.preventDefault();
            let hd = this.actor.data.data.attributes.hitdice.value;
			let conmod = this.actor.data.data.abilities.con.mod;
            let roll1 = new Roll(`${hd}`).roll().total + conmod;
			let hp = this.actor.data.data.attributes.hp.value;
	// Send content to chat
            let rollWhisper = null;
            let rollBlind = false;
			let content = `
				<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
					<header class="card-header flexrow">
						<img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;"/>
						<h3>Rolling hitdice</h3>(${hd} + ${conmod})
					</header>
					</br>
					<h3 style="text-shadow: 0 0 4px; text-align: center;">${roll1}</h3>
			</div>`;
            let rollMode = game.settings.get("core", "rollMode");
            if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
            if (rollMode === "blindroll") rollBlind = true;
			// If Epic fail
			ChatMessage.create({
                user: game.user._id,
                content: content,
                speaker: {
                    actor: this.actor._id,
                    token: this.actor.token,
                    alias: this.actor.name
                },
                whisper: ChatMessage.getWhisperIDs("GM"),
                blind: rollBlind,
                sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'table'}}
            });
			const newhp = this.actor.data.data.attributes.hp.value + roll1;
				if(newhp >= this.actor.data.data.attributes.hp.max)
				{
					this.actor.data.data.attributes.hp.value = his.actor.data.data.attributes.hp.max
				}
				else{this.actor.data.data.attributes.hp.value = newhp}
        });
	
		/*LOOK FOR DEFENSEROLL*/
        html.find('.handy-ac').click(event => {
            event.preventDefault();
            let ac = this.actor.data.data.attributes.ac.value;
            let roll1 = new Roll(`d20`).roll().total;
            let roll2 = new Roll(`d20`).roll().total;
            let rollResult = new Roll(`${roll1}+${ac}`).roll().total;
            let rollResult2 = new Roll(`${roll2}+${ac}`).roll().total;
			let wounds = this.actor.data.data.attributes.wounds.value;
            let content = `
<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
    <header class="card-header flexrow">
        <img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;" />

        <div class="dice-roll red-dual">
            <h3>Active Defense</h3>
            <div class="dice-result">
                <div class="dice-formula dice-tooltip" style="display: none;">1d20 + ${ac}</div>
                <div class="dice-row">
                    <div class="dice-row">
                        <div class="tooltip dual-left">
                            <div class="dice-tooltip" style="display: none;">

                                <div class="dice">
                                    <p class="part-formula">
                                        1d20 + ${ac}
                                        <span class="part-total">${rollResult}</span>
                                    </p>
                                    <ol class="dice-rolls">
                                        <li class="roll d20">${roll1}</li>
                                    </ol>
                                </div>

                            </div>
                        </div>
                        <div class="tooltip dual-right">
                            <div class="dice-tooltip" style="display: none;">

                                <div class="dice">
                                    <p class="part-formula">
                                        1d20 + ${ac}
                                        <span class="part-total">${rollResult2}</span>
                                    </p>
                                    <ol class="dice-rolls">
                                        <li class="roll d20">${roll2}</li>
                                    </ol>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
                <div class="dice-row">
                    <h4 class="dice-total dual-left">${rollResult}</h4>
                    <h4 class="dice-total dual-right">${rollResult2}</h4>
                </div>
            </div>
        </div>
    </header>
</div>`;
let content2 = `
<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
    <header class="card-header flexrow">
        <img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;" />

        <div class="dice-roll red-dual">
            <h3>Defense Roll</h3>
            <div class="dice-result">
                <div class="dice-formula dice-tooltip" style="display: none;">1d20 + ${ac}</div>
                <div class="dice-row">
                    <div class="dice-row">
                        <div class="tooltip dual-left">
                            <div class="dice-tooltip" style="display: none;">

                                <div class="dice">
                                    <p class="part-formula">
                                        1d20 + ${ac}
                                        <span class="part-total">${rollResult}</span>
                                    </p>
                                    <ol class="dice-rolls">
                                        <li class="roll d20">${roll1}</li>
                                    </ol>
                                </div>

                            </div>
                        </div>
                        <div class="tooltip dual-right">
                            <div class="dice-tooltip" style="display: none;">

                                <div class="dice">
                                    <p class="part-formula">
                                        1d20 + ${ac}
                                        <span class="part-total">${rollResult2}</span>
                                    </p>
                                    <ol class="dice-rolls">
                                        <li class="roll d20">${roll2}</li>
                                    </ol>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
                <div class="dice-row">
                    <h4 class="dice-total dual-left" style="color: red;text-shadow: 0 0 3px;">${rollResult}</h4>
                    <h4 class="dice-total dual-right">${rollResult2}</h4>
                </div>
            </div>
        </div>
    </header>
	</br>
	<h4 class="woundroll" style="text-align: center;">You need to <b>roll</br> for ${wounds} wound(s)</h4>
	<h4 style="text-align: center;">One of your items gains a notch<h4>
</div>`;
let content3 = `
<div class="dnd5e chat-card item-card" data-acor-id="${this.actor._id}">
    <header class="card-header flexrow">
        <img src="${this.actor.data.token.img}" title="" width="36" height="36" style="border: none;" />

        <div class="dice-roll red-dual">
            <h3>Defense Roll</h3>
            <div class="dice-result">
                <div class="dice-formula dice-tooltip" style="display: none;">1d20 + ${ac}</div>
                <div class="dice-row">
                    <div class="dice-row">
                        <div class="tooltip dual-left">
                            <div class="dice-tooltip" style="display: none;">

                                <div class="dice">
                                    <p class="part-formula">
                                        1d20 + ${ac}
                                        <span class="part-total">${rollResult}</span>
                                    </p>
                                    <ol class="dice-rolls">
                                        <li class="roll d20">${roll1}</li>
                                    </ol>
                                </div>

                            </div>
                        </div>
                        <div class="tooltip dual-right">
                            <div class="dice-tooltip" style="display: none;">

                                <div class="dice">
                                    <p class="part-formula">
                                        1d20 + ${ac}
                                        <span class="part-total">${rollResult2}</span>
                                    </p>
                                    <ol class="dice-rolls">
                                        <li class="roll d20">${roll2}</li>
                                    </ol>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
                <div class="dice-row">
                    <h4 class="dice-total dual-left">${rollResult}</h4>
                    <h4 class="dice-total dual-left" style="color: red;text-shadow: 0 0 3px;">${rollResult2}</h4>
                </div>
            </div>
        </div>
    </header>
	</br>
	<h4 class="woundroll" style="text-align: center;">You need to <b>roll</br> for ${wounds} wound(s)</h4>
	<h4 style="text-align: center;">One of your items gains a notch<h4>
</div>`;	
            // Send content to chat
            let rollWhisper = false;
            let rollBlind = false;
            let rollMode = game.settings.get("core", "rollMode");
            if (["gmroll", "blindroll"].includes(rollMode)) rollWhisper = ChatMessage.getWhisperIDs("GM");
            if (rollMode === "blindroll") rollBlind = false;
			// If Epic fail
			if(roll1 === 1)
			{
			ChatMessage.create({
                user: game.user._id,
                content: content2,
                speaker: {
                    actor: this.actor._id,
                    token: this.actor.token,
                    alias: this.actor.name
                },
                whisper: ChatMessage.getWhisperIDs("GM"),
                blind: rollBlind,
                sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'bad'}}
            });
			}
			else if(roll2 === 1){
			ChatMessage.create({
                user: game.user._id,
                content: content3,
                speaker: {
                    actor: this.actor._id,
                    token: this.actor.token,
                    alias: this.actor.name
                },
                whisper: ChatMessage.getWhisperIDs("GM"),
                blind: rollBlind,
                sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'bad'}}
            });
			}
			else{
            ChatMessage.create({
                user: game.user._id,
                content: content,
                speaker: {
                    actor: this.actor._id,
                    token: this.actor.token,
                    alias: this.actor.name
                },
                whisper: ChatMessage.getWhisperIDs("GM"),
                blind: rollBlind,
                sound: CONFIG.sounds.dice,
				flags: {darksheet: {outcome: 'table'}}
            });
			}
        });
		/*END LOOK FOR DEFENSEROLL END*/


    }
}