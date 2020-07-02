import {FlowEvents} from './flow-events.js';
import {dpc, UID} from './helpers.js';

export * from './flow-events.js';
export class FlowSocketIO {
	constructor(options){
		this.online = false;
		

		this.options = Object.assign({
			path:'/rpc',
			id:UID(),
			timeout:30,
			origin:window.location.origin
		}, options || {});

		this.timeout  = this.options.timeout;
		this.id = this.options.id;

		this.init();
	}

	init() {
		this.initEvent();
		this.connected = false;
		if (this.options.path)
			this.connect();
	}

	initEvent() {
		this.pending = new Map();
		this.events = new FlowEvents();
	}

	connect(){
		if (this._connected || !this.options.path)
			return;
		this._connected = true;
		this.events.emitAsync('rpc-connecting');
		let io = this.options.io || window.io;
		this.socket = io(this.options.origin+this.options.path, this.options.args || {});
		//console.log("this.options.args"+this.options.args)
		this.socket.on('ready', ()=>{
			this.online = true;
		})
		this.socket.on('connect', ()=>{
			console.log("RPC connected");
			this.events.emit('rpc-connect');
		})
		this.socket.on('connect_error', (err)=>{
			this.events.emit('rpc-connect-error', err);
		})
		this.socket.on('error', (...args)=>{ 
			console.log("RPC error", args);
			this.events.emit('rpc-error', args);
		})
		this.socket.on('offline', ()=>{
			//window.location.reload();
			this.events.emit('offline');
		})
		this.socket.on('disconnect', ()=>{ 
			this.online = false;
			console.log("RPC disconnected", arguments);
			this.events.emit('rpc-disconnect');

			this.pending.forEach((info, id)=>{
				info.callback({ error : "Connection Closed"});
			});

			this.pending.clear();
		});

		this.initSocket();

		let timeoutMonitor = ()=>{
			let ts = Date.now();
			let purge = [ ]
			this.pending.forEach((info, id)=>{
				if(ts - info.ts > this.timeout * 1000) {
					info.callback({ error : "Timeout "});
					purge.push(id);
				}
			});
			purge.forEach(id=>{
				this.pending.delete(id);
			});
			dpc(1000, timeoutMonitor);
		}
		dpc(1000, timeoutMonitor);

	}

	close(){
		if(this.socket)
			this.socket.close();
	}

	initSocket() {}
}



export class FlowSocketIORPC extends FlowSocketIO {
	constructor(options) {
		super(options);
	}


	initSocket() {

		this.socket.on('message', msg=>{
			let {subject, data} = msg;
			if(msg.op){
				subject = msg.op;
				data = msg;
			}
			if(this.trace) {
				if(this.trace === 1 || this.trace === true)
					console.log('RPC ['+this.id+']:', subject);
				else
				if(this.trace === 2)
					console.log('RPC ['+this.id+']:', subject, data);                
			}
			this.events.emit(subject, data);
		})

		this.socket.on('rpc::response', (msg)=>{
			let {rid, error, data} = msg;
			let info = rid && this.pending.get(rid);
			if(info)
				info.callback.call(this, error, data);
			else if(rid)
				console.log("RPC received unknown rpc callback (strange server-side retransmit?)");

			rid && this.pending.delete(rid);
		})

	}


	on(op, callback) {
		this.events.on(op, callback);
	}

	dispatch(subject, data, callback) {
		if(subject.op){//<-- old way
			callback = data;
			data = subject;
			subject = subject.op;
		}else{
			if(typeof(data)=='function'){
				callback = data;
				data = undefined;
			}
		}

		if(!callback)
			return this.socket.emit('message', {subject, data});

		let rid = UID();

		this.pending.set(rid, {
			ts:Date.now(),
			callback
		})

		this.socket.emit('rpc.req', { 
			rid,
			req : {subject, data}
		});
	}

}


export class FlowSocketIONATS extends FlowSocketIO {
	constructor(options) {
		super(options);
	}

	initSocket() {
		this.socket.on('message', msg=>{
			let {subject, data} = msg;
			if(msg.op){
				subject = msg.op;
				data = msg;
			}
			if(this.trace) {
				if(this.trace === 1 || this.trace === true)
					console.log('RPC ['+this.id+']:', subject);
				else
				if(this.trace === 2)
					console.log('RPC ['+this.id+']:', subject, data);                
			}
			this.events.emit(subject, data);
		})

		this.socket.on('publish::response', (msg)=>{
			let {rid, error, data} = msg;
			let info = rid && this.pending.get(rid);
			if(info)
				info.callback.call(this, error, data);
			else if(rid)
				console.log("RPC received unknown rpc callback (strange server-side retransmit?)");

			rid && this.pending.delete(rid);
		})


		this.socket.on('request', (msg)=>{
			let { req : { subject, data }, rid } = msg;
			
			// TODO - check this.events for handlers
		})


		this.socket.on('publish', (msg)=>{
			let { req : { subject, data } } = msg;
			this.events.emit(subject, data);
			
			// TODO - check this.events for handlers
		})

		this.socket.on('response', (msg)=>{
			let {rid, error, data} = msg;
			let info = rid && this.pending.get(rid);
			if(info)
				info.callback.call(this, error, data);
			else if(rid)
				console.log("NATS RPC received unknown rpc callback (strange server-side retransmit?)");

			rid && this.pending.delete(rid);
		})
	}

	on(op, callback) {
		this.events.on(op, callback);
	}
	
	request(subject, data, callback) {
		if(subject.op){//<-- old way
			callback = data;
			data = subject;
			subject = subject.op;
		}else{
			if(typeof(data)=='function'){
				callback = data;
				data = undefined;
			}
		}

		if(!callback)
			throw new Error(`FlowSocketIONATS::request() - callback required`);

		let rid = UID();

		this.pending.set(rid, {
			ts:Date.now(),
			callback
		})

		this.socket.emit('rpc.req', { 
			rid,
			req : {subject, data}
		});
	}

	publish(subject, msg, callback) {
		return new Promise((resolve, reject) => {
			let rid = UID();

			let ack = !!callback;

			ack && this.pending.set(rid, {
				ts:Date.now(),
				callback : (err)=>{
					if(typeof callback == 'function')
						return callback(err);
					else
						return err ? reject(err) : resolve();
				}
			})

			this.socket.emit('publish', {
				req : { subject, data },
				rid,
				ack
			})
		})	
	}


	subscribe(subject, msg) {
		return new Promise((resolve, reject) => {
			let rid = UID();

			let ack = !!callback;

			ack && this.pending.set(rid, {
				ts:Date.now(),
				callback : (err)=>{
					return err ? reject(err) : resolve();
				}
			})

			this.socket.emit('subscribe', {
				req : { subject, data },
				rid,
				ack
			})
		})	
	}

}

