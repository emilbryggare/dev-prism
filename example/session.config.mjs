export default {
  projectName: 'hello',
  sessionsDir: '../sessions',

  // Services to expose with random ports (v0.6+ requirement)
  services: [
    { name: 'app', internalPort: 3000 },
  ],

  // No setup commands needed for this simple example
  setup: [],
};
