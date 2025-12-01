varying vec3 vDirection;

void main() {
    // Use local position as direction - this stays constant regardless of where the sky sphere is
    vDirection = position;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
}
