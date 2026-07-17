import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const MAX_SPEED = 30;
const ACCELERATION = 300;
const TURN_SPEED = 200;
const BRAKE_FORCE = 300;

const _vel = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export default function PlayerCar({ carRef, active = true, color = '#FF6EC7', onStateChange }) {
  const keys = useRef({});

  useEffect(() => {
    const down = (e) => {
      if (e.key.startsWith('Arrow')) e.preventDefault();
      keys.current[e.key] = true;
    };
    const up = (e) => { keys.current[e.key] = false; };
    // Perder o foco (alt-tab) larga as teclas — senão o carro fica preso a acelerar
    const onBlur = () => { keys.current = {}; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useFrame((_, delta) => {
    if (!carRef.current) return;
    if (!active) return; // a pé: carro ignora input e fica onde está

    const body = carRef.current;
    const linvel = body.linvel();
    const rot = body.rotation();

    _vel.set(linvel.x, 0, linvel.z);
    const speed = _vel.length();

    _quat.set(rot.x, rot.y, rot.z, rot.w);
    _forward.set(0, 0, -1).applyQuaternion(_quat);

    const k = keys.current;
    const accel = k['ArrowUp']   || k['w'] || k['W'];

    const brake = k['ArrowDown'] || k['s'] || k['S'];
    const left  = k['ArrowLeft'] || k['a'] || k['A'];
    const right = k['ArrowRight']|| k['d'] || k['D'];

    if (accel && speed < MAX_SPEED) {
      body.applyImpulse({
        x: _forward.x * ACCELERATION * delta,
        y: 0,
        z: _forward.z * ACCELERATION * delta,
      }, true);
    }

    if (brake) {
      body.applyImpulse({
        x: -_forward.x * BRAKE_FORCE * delta,
        y: 0,
        z: -_forward.z * BRAKE_FORCE * delta,
      }, true);
    }

    if ((left || right) && speed > 0.5) {
      const dir = left ? 1 : -1;
      const torque = dir * TURN_SPEED * delta * Math.min(speed / 5, 1);
      body.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true);
    }

    if (speed > MAX_SPEED) {
      const factor = MAX_SPEED / speed;
      body.setLinvel({ x: linvel.x * factor, y: linvel.y, z: linvel.z * factor }, true);
    }
  });

  // onStateChange will be called in Sub-system 4 when pickups/collisions are added
  return (
    <RigidBody
      ref={carRef}
      position={[-80, 1, 6]}
      rotation={[0, -Math.PI / 2, 0]}
      mass={1}
      friction={0}
      restitution={0}
      linearDamping={2}
      angularDamping={10}
      colliders="cuboid"
      enabledRotations={[false, true, false]}
    >
      {/* Corpo principal */}
      <mesh castShadow>
        <boxGeometry args={[2, 0.8, 4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Tejadilho */}
      <mesh position={[0, 0.7, -0.3]} castShadow>
        <boxGeometry args={[1.8, 0.6, 2]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Vidros escuros à volta da cabine */}
      <mesh position={[0, 0.68, -0.3]}>
        <boxGeometry args={[1.84, 0.38, 2.04]} />
        <meshStandardMaterial color="#101820" roughness={0.15} metalness={0.7} />
      </mesh>
      {/* Underglow néon rosa */}
      <mesh position={[0, -0.56, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 4.6]} />
        <meshStandardMaterial
          color="#FF50C8" emissive="#FF50C8" emissiveIntensity={2.5}
          transparent opacity={0.55} side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight position={[0, -0.3, 0]} color="#FF50C8" intensity={12} distance={6} decay={2} />
      {/* Rodas */}
      {[[-1, -0.4, 1.3], [1, -0.4, 1.3], [-1, -0.4, -1.3], [1, -0.4, -1.3]].map((pos, i) => (
        <mesh key={i} position={pos} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.4, 0.4, 0.3, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
      {/* Faróis (frente = -z) */}
      <mesh position={[-0.6, 0.05, -2.01]}>
        <boxGeometry args={[0.4, 0.22, 0.05]} />
        <meshStandardMaterial color="#FFF8D0" emissive="#FFF0A0" emissiveIntensity={3.5} />
      </mesh>
      <mesh position={[0.6, 0.05, -2.01]}>
        <boxGeometry args={[0.4, 0.22, 0.05]} />
        <meshStandardMaterial color="#FFF8D0" emissive="#FFF0A0" emissiveIntensity={3.5} />
      </mesh>
      {/* Luzes traseiras */}
      <mesh position={[-0.6, 0.05, 2.01]}>
        <boxGeometry args={[0.4, 0.2, 0.05]} />
        <meshStandardMaterial color="#FF3020" emissive="#FF2010" emissiveIntensity={2.2} />
      </mesh>
      <mesh position={[0.6, 0.05, 2.01]}>
        <boxGeometry args={[0.4, 0.2, 0.05]} />
        <meshStandardMaterial color="#FF3020" emissive="#FF2010" emissiveIntensity={2.2} />
      </mesh>
    </RigidBody>
  );
}
