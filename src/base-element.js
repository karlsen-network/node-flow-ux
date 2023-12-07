/*
* Flow-UX: src/base-element.js
* version: 1.0.0
*/

import {LitElement, html, css} from 'lit-element/lit-element.js';
export * from 'lit-html/directive.js';
export * from 'lit-html/async-directive.js';
import { AsyncQueueSubscriber } from './flow-async.js';

export * from 'lit-element/lit-element.js';
//export * from 'lit-html';

import {
	baseUrl, debug, FlowIconPath, FlowIcons, resolveIcon,
	FlowStates, DeferComponent, flow
} from './helpers.js';
import {styleAppendTo, sizeClsMap} from "./helpers.js";
export * from './helpers.js';
export * from './flow-html.js';
export * from './pagination.js';

/**
* @class BaseElement
* @extends LitElement
*/
export class BaseElement extends LitElement{

	static get baseUrl(){
		return baseUrl;
	}

	static hashCode(str){//java String#hashCode
		var hash = 0;
		for (var i = 0; i < str.length; i++) {
			hash = str.charCodeAt(i) + ((hash << 5) - hash);
		}
		return hash;
	} 

	static intToRGB(i){
		var c = (i & 0x00FFFFFF)
			.toString(16)
			.toUpperCase();

		return "00000".substring(0, 6 - c.length) + c;
	}

	/**
	* convert any string to color hex code
	* @param {String} str any string i.e 'hello'
	* @return {String} color hex code i.e `#DDFFAA`
	*/
	static strToColor(str){
		return '#'+this.intToRGB(this.hashCode(str));
	}

	/**
	* @desc define customElements. you can call on drived/child class as <code class="prettyprint js">CoolElement.define('my-cool-element')</code>
	* @param {String} name name of tag i.e. 'my-cool-element'
	* @since 0.0.1
	*/
	static define(name, deps, ready){
		if(deps) {
			DeferComponent(this,name,deps,ready);
		}
		else
			this.defineElement(name);
	}

	static defineElement(name){
		customElements.define(name, this);
	}

	static get svgStyle(){
		return css`
			svg.icon{
				width:28px;
				height:28px;
				margin:0px 5px;
				fill:var(--flow-primary-color);
			}
		`
	}

	static createElement(name, attr={}, props={}){
		let el = document.createElement(name);
		Object.keys(attr).forEach(k=>{
			el.setAttribute(k, attr[k])
		})
		Object.keys(props).forEach(k=>{
			el[k] = props[k];
		})

		return el;
	}

	static setLocalSetting(name, value, prefix='flow-'){
		if(!window.localStorage)
			return

		window.localStorage[prefix+name] = value;
	}

	static getLocalSetting(name, defaults, prefix='flow-'){
		if(!window.localStorage)
			return defaults;

		let value = window.localStorage[prefix+name];
		if(typeof(value) == 'undefined')
			return defaults

		return value;
	}

	/**
	* fire CustomEvent
	* @param {String} eventName name of event
	* @param {Object=} detail event's [detail]{@link https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail} property
	* @param {Object=} options [CustomEventInit dictionary]{@link https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent}
	* @param {HTMLElement=} event target (default: window)
	* @return {boolean} The return value is false if event is cancelable and at least one of the event handlers which handled this event called Event.preventDefault(). Otherwise it returns true.
	* @since 0.0.1
	*/
	static fire(eventName, detail={}, options={}, el=null, returnEvent=false){
		let ev = new CustomEvent(eventName, Object.assign({}, options, {detail}));
		let result = (el || window).dispatchEvent(ev);
		return returnEvent?ev:result
	}

	static get sizeClsMap(){
		return sizeClsMap
	}
	static setElementSizeClass(cmp, width){

		width = width || cmp.getBoundingClientRect().width;
		let found = [...this.sizeClsMap.entries()].find(([key, size])=>{
			//console.log("foundfoundfound:key,size", key, size)
			return width<=size
		}) || ["LG"];

		//console.log("foundfoundfound", width, found)
		let cls = [...this.sizeClsMap.keys(), "LG"];
		let [clsToAdd] = found;
		cls.splice(cls.indexOf(clsToAdd), 1);
		cmp.classList.remove(...cls);
		
		//temporarily remove XSS size for accounts panel
		// if(clsToAdd == "XXS")
		// 	clsToAdd = "TINY";
		//console.log("foundfoundfound:adding cls", cls, clsToAdd, cmp)
		cmp.classList.add(clsToAdd);
		cmp.sizeCls = clsToAdd;

	}

	constructor(){
		super();
		const name = this.constructor.name;
		this.__cname = name.toLowerCase().replace("flow", "");
		this._initLog();
	}

	initPropertiesDefaultValues(props=null){
		this.constructor.elementProperties.forEach((v, key)=>{
			//console.log("key, v", key, v)
			let type = typeof v.value;
			if(!['undefined', 'function'].includes(type))
				this[key] = v.value;
		})
		if(props){
			Object.keys(props).forEach(name=>{
				if(typeof props[name].value != 'undefined')
					this[name] = props[name].value
			})
		}
	}

	_initLog(forceLog = false, name){
		let {localStorage:lS} = window;
		let {debug} = lS||{};
		name = name || this.constructor.name;
		if(forceLog||debug=="all"||debug=="*"||
			(debug+"").indexOf(this.__cname)>-1 ||
			(debug+"").indexOf(name) >-1){
			this.log = Function.prototype.bind.call(
				console.log,
				console,
				`%c[${name}]`,
				`font-weight:bold;color:${this.constructor.strToColor(name)}`
			);
		}else{
			this.log = ()=>{
				//
			}
		}
	}

	cloneValue(value){
		if( value instanceof Array )
			return value.map(v=>this.cloneValue(v))
		else if( value instanceof Object ){
			let r = {}
			Object.entries(value).forEach( ([k,v])=>{
				r[k] = this.cloneValue(v);
			})
			return r;
		}

		return value;	
	}

	/**
	* update the property by its path
	* @param {String} path propery path i.e `tabs.2.disable`
	* @param {*} value new value
	*
	*/
	set(path, value){
		const parts = path.split(".");
		let v = this;
		let last = parts.length-1;
		let updated = false;
		let lastValue = this.cloneValue(v[parts[0]]);
		
		parts.find((p, i)=>{
			if( !(v instanceof Object) )
				return
			if(i==last){
				v[p] = value;
				//this.log("v, p, i, v", {v, p, i, value})
				updated = true;
				return true;
			}
			v = v[p];
		})
		if(updated){
			this.requestUpdate(parts[0], lastValue)
			//this.log("requestUpdate, prop, lastValue", parts[0], lastValue)
		}
		return updated;
	}
 
	/**
	* fire CustomEvent
	* @param {String} eventName name of event
	* @param {Object=} detail event's [detail]{@link https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail} property
	* @param {Object=} options [CustomEventInit dictionary]{@link https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent}
	* @param {HTMLElement=} event target (default: this element)
	* @return {boolean} The return value is false if event is cancelable and at least one of the event handlers which handled this event called Event.preventDefault(). Otherwise it returns true.
	* @since 0.0.1
	*/
	fire(eventName, detail={}, options={}, el=null, returnEvent=false){
		let ev = new CustomEvent(eventName, Object.assign({}, options, {detail}));
		let result = (el || this).dispatchEvent(ev);
		return returnEvent?ev:result

	}

	/**
	* debounce provided function for given time
	* @param {String} name key name to debounce function
	* @param {Function} fn a function to debounce
	* @param {Number} time time in milliseconds for delay
	* @return {Object} a reference to debounced function
	* @since 0.0.1
	*/
	debounce(name, fn, time){
		this._debounce = this._debounce || new Map();
		if(this._debounce.has(name))
			this._debounce.get(name).cancel();

		this._debounce.set(name, {
			id:setTimeout(fn, time),
			cancel(){
				if(!this.id){
					clearTimeout(this.id)
					this.id = null;
				}

			}
		})

		return this._debounce.get(name);
	}

	buildUrl(url){
		return this.constructor.baseUrl + url;
	}
	iconPath(name, i){
		return resolveIcon(this.__cname, name, i);
	}

	/**
	* Logs given values
	* @param {...*} args
	*/
	log(...args){
	}


	renderOnStateChange(state, ON=true){
		if(!this._renderOnStateChange)
			this._renderOnStateChange = {};
		this._renderOnStateChange[state] = ON;
	}

	connectedCallback() {
		super.connectedCallback();

		let stateChange = this._renderOnStateChange || {};
		let ONLINE = stateChange[FlowStates.ONLINE];
		let AUTH = stateChange[FlowStates.AUTH];
		let GET_NETWORK_AND_USER_STATE = false;
		if(this.onlineCallback || ONLINE) {
			this.onlineCallback_ = (...args)=>{
				this.__online = true;
				this.onlineCallback?.(...args);
				if(ONLINE)
					this.requestUpdate("FLOW-NETWORK-ONLINE", false)
			}
			window.addEventListener('network-iface-online', this.onlineCallback_);
			GET_NETWORK_AND_USER_STATE = true;
		}

		if(this.offlineCallback || ONLINE) {
			this.offlineCallback_ = (...args)=>{
				this.__online = false;
				this.offlineCallback?.(...args);
				if(ONLINE)
					this.requestUpdate("FLOW-NETWORK-ONLINE", true)
			}
			window.addEventListener('network-iface-offline', this.offlineCallback_);
			GET_NETWORK_AND_USER_STATE = true;
		}

		if(this.signinCallback || AUTH) {
			this.signinCallback_ = (...args)=>{
				this.__signedin = true;
				this.signinCallback?.(...args);
				if(AUTH)
					this.requestUpdate("FLOW-USER-AUTH", false)
			}
			window.addEventListener('flow-user-signin', this.signinCallback_);
			GET_NETWORK_AND_USER_STATE = true;
		}

		if(this.signoutCallback || AUTH) {
			this.signoutCallback_ = (...args)=>{
				this.__signedin = false;
				this.signoutCallback?.(...args);
				if(AUTH)
					this.requestUpdate("FLOW-USER-AUTH", true)
			}
			window.addEventListener('flow-user-signout', this.signoutCallback_);
			GET_NETWORK_AND_USER_STATE = true;
		}

		if(GET_NETWORK_AND_USER_STATE){
			let ce = this.fire("flow-network-and-user-state-get", {}, {}, window, true);
			//console.log("signedin, online", ce.detail, this)
			let {signedin, online} = ce.detail || {};

			if(typeof online != 'undefined'){
				if(online){
					this.onlineCallback_?.()
				}else{
					this.offlineCallback_?.()
				}
			}
			if(typeof signedin != 'undefined'){
				if(signedin){
					this.signinCallback_?.()
				}else{
					this.signoutCallback_?.()
				}
			}
		}

		if(this.onReCaptchaReady){
			this._onReCaptchaReady = this.onReCaptchaReady.bind(this);
			window.addEventListener("g-recaptcha-ready", this._onReCaptchaReady)
		}

		if(this.registeredListeners) {
			this.registeredListeners.forEach(({ name, handler }) => {
				window.addEventListener(name, handler);
			})
		}

		if(this.socketSubscriptions) {
			this.socketSubscriptions.forEach((subscription) => {
				subscription.resubscribe();
			})
		}

	}

	onlineCallback() {
		super.onlineCallback?.();
		if(this.pendingSocketSubscriptions) {
			this.pendingSocketSubscriptions.forEach((subscription) => {
				const { subject } = subscription;
				this.subscribe(subject, subscription);
				//subscription.resubscribe();
			})
		}

	}

	disconnectedCallback() {
		super.disconnectedCallback();
		
		if(this.onlineCallback_) {
			window.removeEventListener('network-iface-online', this.onlineCallback_);
			delete this.onlineCallback_;
		}
		if(this.offlineCallback_) {
			window.removeEventListener('network-iface-offline', this.offlineCallback_);
			delete this.offlineCallback_;
		}
		if(this.signinCallback_) {
			window.removeEventListener('flow-user-signin', this.signinCallback_);
			delete this.signinCallback_;
		}
		if(this.signoutCallback) {
			window.removeEventListener('flow-user-signout', this.signoutCallback);
			delete this.signoutCallback;
		}
		if(this._onReCaptchaReady){
			window.removeEventListener("g-recaptcha-ready", this._onReCaptchaReady)
		}

		if(this.registeredListeners) {
			this.registeredListeners.forEach(({ name, handler }) => {
				window.removeEventListener(name, handler);
			})
		}

		if(this.socketSubscriptions) {
			this.socketSubscriptions.forEach((subscription)=>{
				subscription.unsubscribe();
			})
		}
	}

	registerListener(name_, handler_) {
		const {name, handler} = this.addToListenersStack(name_, handler_);
		window.addEventListener(name, handler);
		//console.log("window.addEventListener",name,handler);
	}
	addToListenersStack(name, handler_, stack){
		if(!this.registeredListeners)
			this.registeredListeners = [];
		const handler = handler_ || (() => { this.requestUpdate(); });//.bind(this);
		(stack||this.registeredListeners).push({name,handler});
		return {name,handler};
		
	}

	removeListeners() {
		if(this.registeredListeners) {
			this.registeredListeners.forEach(({ name, handler }) => {
				window.removeEventListener(name, handler);
			})
		}
		this.registeredListeners = [];
	}

	bindDDTriggers(skipEventBind=false){
		
		let triggers = this.renderRoot.querySelectorAll("[data-trigger-for]");
		//console.log("bindDDTriggers", this, triggers)
		triggers.forEach(node=>{
			let id = node.getAttribute("data-trigger-for");
			//console.log("idididid", id)
			if(!id)
				return
			let selector = id;
			if(id[0]!="#")
				selector = "#"+selector;
			let key = node.dataset.ddKey
			if(!key){
				key = id.replace("#", "");
				if(!/DD$/.test(key))
					key = key+"DD";
			}
			let dd = this[key]||this.renderRoot.querySelector(selector);
			//console.log("idididid", {id, key, selector, dd})
			if(!dd)
				node.flowDropdown = null;
			this[key] = dd;
			node.flowDropdown = dd;
			if(skipEventBind)
				return
			if(!node["event-bind-"+id]){
				node["event-bind-"+id] = true;
				node.addEventListener("click", ()=>{
					if(!this[key])
						return
					this[key].toggle();
				})
			}
		})
	}

	isOnline(){
		return this.__online;
	}
	isSignedin(){
		return this.__signedin;
	}
	serialize(){
		return {
			nodeName: this.nodeName
		}
	}
	deserialize(){
		//
	}
	subscribe(subject, subscriber){
		if(!flow.app.defaultRPC) {
			subscriber = new AsyncQueueSubscriber(null,subject);
			if(!this.pendingSocketSubscriptions)
				this.pendingSocketSubscriptions = [];
			this.pendingSocketSubscriptions.push(subscriber);
			return subscriber;
		} else {
			subscriber = flow.app.defaultRPC.subscribe(subject, subscriber);
			if(!this.socketSubscriptions)
				this.socketSubscriptions = new Map();
			this.socketSubscriptions.set(subscriber.uid, subscriber);
			return subscriber;
		}
	}
	request(subject, data, callback){
		return flow.app.defaultRPC.request(subject, data, callback);
	}
}

export const ScrollbarStyle = css`
*::-webkit-scrollbar-track,
:host::-webkit-scrollbar-track{
    box-shadow:var(--flow-scrollbar-track-box-shadow, initial);
    background:var(--flow-scrollbar-track-bg, initial);
}

*::-webkit-scrollbar,
:host::-webkit-scrollbar{
	width:var(--flow-scrollbar-width, initial);
	height:var(--flow-scrollbar-width, initial);
	background:var(--flow-scrollbar-bg, initial);
}
*::-webkit-scrollbar-thumb,
:host::-webkit-scrollbar-thumb{
    box-shadow:var(--flow-scrollbar-thumb-box-shadow, initial);
    background:var(--flow-scrollbar-thumb-bg, initial);
}
`

ScrollbarStyle.appendTo = styleAppendTo(ScrollbarStyle);

let getLocalSetting = BaseElement.getLocalSetting;
let setLocalSetting = BaseElement.setLocalSetting;
export {getLocalSetting, setLocalSetting}

export const SpinnerStyle = css`
	@keyframes spinner-animation{0%{transform:rotate(0deg)}100%{transform:rotate(359deg)}}
	.spinner{
		webkit-animation: spinner-animation 2s linear infinite;
	    animation: spinner-animation 2s linear infinite;
	    transform-origin:center;
	}
	fa-icon.spinner:not([hidden]){display:inline-block;position:relative}
`
