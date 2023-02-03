/*
File:	Project1.html
Author:	Austin Sands
Date:	01/29/2023
Desc:	This HTML file is made to facilitate the js file used for my class project.
*/

import * as THREE from 'three';
import {OrbitControls} from 'OrbitControls';
import {RoundedBoxGeometry} from 'RoundedBoxGeometry';
import Stats from 'Stats';
import {EffectComposer} from 'EffectComposer';
import { RenderPass } from 'RenderPass';
import { OutlinePass } from 'OutlinePass';

//TODO: focus camera on selected dice

//create variables needed
let loader = new THREE.TextureLoader();
let scene, camera, renderer, table, controls, stats, rollDiceForce, spinDiceForce = 25;
let pointedObject, selectedDice, hovering, clock;
//variables for postprocessing
let effectComposer, hoverOutlinePass, selectedOutlinePass, hoveredObjects;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

//variables for physics (ammo)
let physicsWorld, tempTransform, clampHeight = 20;
let rigidBodies = [];
const STATE = {DISABLE_DEACTIVATION : 4};

//initialize Ammo
Ammo().then(mainLoop);

function initPhysics() {
	//initialize physics components from Ammo
	let collisionConfiguration = new Ammo.btDefaultCollisionConfiguration(),
		dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration),
		broadphase = new Ammo.btDbvtBroadphase(),
		solver = new Ammo.btSequentialImpulseConstraintSolver();
		
		physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
		physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));
		
		tempTransform = new Ammo.btTransform();
		
		rollDiceForce = new Ammo.btVector3(0, 10, 0);
} //end initPhysics

//function to initialize scene
function initThree() {
	
	//create clock for timing
	clock = new THREE.Clock();
	
	//create scene
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0xCFE2F3);

	//create prespective camera and set camera position
	camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
	camera.position.set(20, 40, 20);
	camera.lookAt(new THREE.Vector3(0,0,0));

	//create renderer and attach to element
	renderer = new THREE.WebGLRenderer();
	renderer.setSize(window.innerWidth, window.innerHeight);
	document.body.appendChild(renderer.domElement);
	
	//add stats
	stats = new Stats();
	document.body.appendChild(stats.domElement);

	//create array to hold selected dice
	selectedDice = [];
	
	//create camera controls 
	controls = new OrbitControls(camera, renderer.domElement);
	controls.maxDistance = 100;
	controls.minDistance = 10;
	controls.zoomSpeed = 2;
	controls.enablePan = false;
	controls.enableDamping = true;
	controls.maxPolarAngle = Math.PI / 2.2;
	
	//add ambient light to scene
	scene.add(new THREE.AmbientLight(0x222222));
	
	//add directional light
	scene.add(new THREE.DirectionalLight (0xFFFFFF, 0.125));
	
	//composer needed for post processing (outlines)
	//create composer
	effectComposer = new EffectComposer( renderer);
	
	//create renderPass
	effectComposer.addPass(new RenderPass(scene, camera ));
	
	//create hoverOutlinePass
	hoverOutlinePass = new OutlinePass( new THREE.Vector2( window.innerWidth, window.innerHeight), scene, camera);
	hoverOutlinePass.edgeStrength = 3.0;
	hoverOutlinePass.visibleEdgeColor.set(0xF0FF00);
	hoverOutlinePass.hiddenEdgeColor.set(0x190a05);
	effectComposer.addPass(hoverOutlinePass);
	
	//create selectedOultinePass
	selectedOutlinePass = new OutlinePass( new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
	selectedOutlinePass.edgeStrength = 3.0;
	selectedOutlinePass.visibleEdgeColor.set(0xFFFFFF);
	selectedOutlinePass.hiddenEdgeColor.set(0x190a05);
	effectComposer.addPass(selectedOutlinePass);
} //end initThree

function updateRaycaster() {
	//initialize outlinePass and hovering flag
	hoverOutlinePass.enabled = true;
	hovering = false;
	
	//update raycaster with camera position
	raycaster.setFromCamera(pointer, camera);
	
	//calculate objects intersecting raycaster
	const intersects = raycaster.intersectObjects( scene.children);
		
	//create array to hold selected objects
	hoveredObjects = [];
	
	if (intersects.length > 0 && intersects[0].object != table) {
		
		//add object hovered over to array in order to pass to outlinePass
		pointedObject = intersects[0].object;
		hoveredObjects.push(pointedObject);
		hoverOutlinePass.selectedObjects = hoveredObjects;
		
		//set flag for hovering
		hovering = true;
	}
	else {
		//if no objects intersected, disable outlinePass
		hoverOutlinePass.enabled = false;
	}
	
} //end updateRaycaster

//function to update and render scene
function update() {
	requestAnimationFrame( update);
	
	//time since last update
	let deltaTime = clock.getDelta();
	
	//needed because of enableDamping
	controls.update();

	//update stats
	stats.update();
	
	//update physics world
	updatePhysicsWorld(deltaTime);
	
	//render composed scene
	effectComposer.render();
	
} //end update 

function updatePhysicsWorld(deltaTime) {
	//set max substeps since last called
	physicsWorld.stepSimulation(deltaTime, 10);
	
	//iterate through rigid bodies
	for(let i = 0; i < rigidBodies.length; i++) {
		//save information for object
		let imageObj = rigidBodies[i];
		//save information for objects rigid body
		let physicsObj = imageObj.userData.physicsBody;
				
		//get physics world state, pos and rotation
		let motionState = physicsObj.getMotionState();
		if(motionState) {
			//if there was a motion state attached to the rigid body, get changes in pos and rotation
			motionState.getWorldTransform(tempTransform);
			let updatedPos = tempTransform.getOrigin();
			let updatedRot = tempTransform.getRotation();
			
			//update image to move with rigid body
			//clamp dice to certain height
			if(updatedPos.y() <= clampHeight) {
				imageObj.position.set(updatedPos.x(), updatedPos.y(), updatedPos.z());
			}
			
			imageObj.quaternion.set(updatedRot.x(), updatedRot.y(), updatedRot.z(), updatedRot.w());
		}
	}
}

function createTable() {

	//table position
	const tablePos = new THREE.Vector3(0, -2.5, 0);
	const tableScale = new THREE.Vector3(100, 4, 100);
	const tableMass = 0;

	//create table texture
	const tableMaterial = new THREE.MeshLambertMaterial( {color: 0x523A28});

	//create "table" floor mesh for dice to sit onLine
	const tableGeometry = new THREE.BoxGeometry(tableScale.x, tableScale.y, tableScale.z);
	table = new THREE.Mesh(tableGeometry, tableMaterial);

	table.position.set(tablePos.x, tablePos.y, tablePos.z);
	scene.add(table);
	
	//physical world implementation ammo
	let transform = new Ammo.btTransform();
	transform.setIdentity();
	
	//setup default motion state
	transform.setOrigin(new Ammo.btVector3(tablePos.x, tablePos.y, tablePos.z));
	transform.setRotation(new Ammo.btQuaternion(0, 0, 0, 1));
	let defaultMotionState = new Ammo.btDefaultMotionState(transform);
	
	//setup collision info
	let collisionShape = new Ammo.btBoxShape( new Ammo.btVector3(tableScale.x * 0.5, tableScale.y * 0.5, tableScale.z * 0.5));
	collisionShape.setMargin(0.05);
	
	//setup initial inertia
	let tableInertia = new Ammo.btVector3(0, 0, 0);
	//no need to calculate local inertia here as the rigid body is static with 0 mass
	
	//create rigid body for table
	let tableRBInfo = new Ammo.btRigidBodyConstructionInfo(tableMass, defaultMotionState, collisionShape, tableInertia);
	let tableBody = new Ammo.btRigidBody(tableRBInfo);
	
	//add table rgid body to physics world
	physicsWorld.addRigidBody(tableBody);
	
	table.userData.physicsBody = tableBody;
	rigidBodies.push(table);
} //end createTable

function createD6(pos, color) {
	
	//set d6 dimensions and variables
	let d6Dims = new THREE.Vector3(2, 2, 2);
	let d6Geometry = new  RoundedBoxGeometry(d6Dims.x, d6Dims.y, d6Dims.z, 2, 0.2);
	let d6Mass = 1;
	
	//create dice texture
	let newMatArray = [
		new THREE.MeshPhongMaterial( { map: loader.load('/textures/d6/d6_side_1.jpg'), color: color} ),
		new THREE.MeshPhongMaterial( { map: loader.load('/textures/d6/d6_side_6.jpg'), color: color} ),
		new THREE.MeshPhongMaterial( { map: loader.load('/textures/d6/d6_side_2.jpg'), color: color} ),
		new THREE.MeshPhongMaterial( { map: loader.load('/textures/d6/d6_side_5.jpg'), color: color} ),
		new THREE.MeshPhongMaterial( { map: loader.load('/textures/d6/d6_side_3.jpg'), color: color} ),
		new THREE.MeshPhongMaterial( { map: loader.load('/textures/d6/d6_side_4.jpg'), color: color} )
	];
	
	//create mesh with material and set position
	let newD6 = new THREE.Mesh(d6Geometry, newMatArray);
	newD6.position.set(pos.x, pos.y, pos.z);
	
	//add dice to scene
	scene.add(newD6);
	
	//physical world implementation ammo
	let transform = new Ammo.btTransform();
	transform.setIdentity();
	
	//set default motion state
	transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
	transform.setRotation(new Ammo.btQuaternion(0, 0, 0, 1));
	let defaultMotionState = new Ammo.btDefaultMotionState(transform);
	
	//setup collision
	let collisionShape = new Ammo.btBoxShape( new Ammo.btVector3(d6Dims.x * 0.5, d6Dims.y * 0.5, d6Dims.z * 0.5));
	collisionShape.setMargin(0.05);
	
	//setup initial inertia
	let d6Inertia = new Ammo.btVector3(0, 0, 0);
	collisionShape.calculateLocalInertia(d6Mass, d6Inertia);
	
	//create rigid body for table
	let d6RBInfo = new Ammo.btRigidBodyConstructionInfo(d6Mass, defaultMotionState, collisionShape, d6Inertia);
	let d6Body = new Ammo.btRigidBody(d6RBInfo);
	d6Body.setActivationState(STATE.DISABLE_DEACTIVATION);
	
	//add table rgid body to physics world
	physicsWorld.addRigidBody(d6Body);
	
	newD6.userData.physicsBody = d6Body;
	rigidBodies.push(newD6);
	
} //end createD6

//add event listeners
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('mousedown', onMouseClick);
window.addEventListener( 'resize', onWindowResize );
window.addEventListener('keydown', function (e) {
	switch (event.keyCode) {
		case 32:	//space keyCode
			rollDice();
			break;
	}
});

//function to get mouse position
function onPointerMove(event) {
	pointer.x = (event.clientX / window.innerWidth ) * 2 - 1;
	pointer.y = - (event.clientY / window.innerHeight ) * 2 + 1;
	
	updateRaycaster();
} //end onPointerMove

function onMouseClick(event) {
	
	if(event.button == 0) {
		//initialize outlinePass
		selectedOutlinePass.enabled = true;
		
		if(hovering) {
			//if are currently over dice and click, add dice to selected dice 
			if(!selectedDice.includes(pointedObject)) {
				selectedDice.push(pointedObject);
			}
			else {
				console.log("Dice already selected");
			}
			
			selectedOutlinePass.selectedObjects = selectedDice;
		}
		else {
			selectedOutlinePass.enabled = false;
			selectedDice = [];
		}
	}
}	//end onMouseClick

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	
	renderer.setSize(window.innerWidth, window.innerHeight);
}

function rollDice() {
	
	if(selectedDice.length > 0) {
		for(let i = 0; i < selectedDice.length; i++) {

			selectedDice[i].userData.physicsBody.setLinearVelocity(rollDiceForce);
		
			var spinX = THREE.MathUtils.randFloat(-spinDiceForce, spinDiceForce );
			var spinY = THREE.MathUtils.randFloat(-spinDiceForce, spinDiceForce);
			var spinZ = THREE.MathUtils.randFloat(-spinDiceForce, spinDiceForce);
			
			selectedDice[i].userData.physicsBody.setAngularVelocity(new Ammo.btVector3(spinX, spinY, spinZ));
			console.log(selectedDice[i].userData.physicsBody);
		}
	}
}

function mainLoop() {
	//set transform to apply
	tempTransform = new Ammo.btTransform();
	
	//setting up physics and graphical components
	initPhysics();
	initThree();
	
	//calling functions to create table and two d6
	createTable();
	createD6(new THREE.Vector3(0, 5, 0), 0x00FF00);
	createD6(new THREE.Vector3(0, 1, 5), 0x00F0F0);
	
	update();
} //end mainLoop