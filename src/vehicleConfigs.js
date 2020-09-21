let vehicleConfigs = {
  defaults: {
    id: 'jeep_jku',
    lift: 2,
    color: '#62c520',
    roughness: 0,
    addons: {},
    rim: 'cragar_soft_8',
    rim_color: 'silver',
    rim_diameter: 17,
    rim_width: 12,
    tire: 'bfg_at',
    tire_diameter: 37,
    spare: false,
  },
  vehicles: {
    toyota_4runner_3: {
      name: 'Toyota 4Runner',
      make: 'Toyota',
      model: 'assets/models/vehicles/toyota/4runner/3g/4runner.glb',
      wheel_offset: 0.77,
      axle_front: 1.45,
      axle_rear: -1.24,
      placement: {
        spare_tire: { x: 0, y: 0.7, z: -2.45 },
      },
      default_addons: {
        bumper_f: 'stock',
        sliders: 'stock',
        rack: 'stock',
      },
      addons: {
        bumper_f: {
          name: 'Bumper',
          required: true,
          options: {
            stock: {
              name: 'Stock',
              model: 'assets/models/vehicles/toyota/4runner/3g/stock_bumper.glb',
            },
            shrockworks: {
              name: 'Shrockworks',
              model: 'assets/models/vehicles/toyota/4runner/3g/shrockworks_bumper.glb',
            },
          },
        },
        sliders: {
          name: 'Sliders',
          required: false,
          options: {
            stock: {
              name: 'Stock',
              model: 'assets/models/vehicles/toyota/4runner/3g/stock_sliders.glb',
            },
            steel: {
              name: 'Steel',
              model: 'assets/models/vehicles/toyota/4runner/3g/steel_sliders.glb',
            },
          },
        },
        rack: {
          name: 'Rack',
          required: false,
          options: {
            stock: {
              name: 'Stock',
              model: 'assets/models/vehicles/toyota/4runner/3g/stock_rack.glb',
            },
            whitson: {
              name: 'Whitson Metalworks',
              model: 'assets/models/vehicles/toyota/4runner/3g/whitson_rack.glb',
            },
          },
        },
      },
    },
    toyota_j80: {
      name: 'Toyota Land Cruiser (J80)',
      make: 'Toyota',
      model: 'assets/models/vehicles/toyota/land_cruiser/j80/j80.glb',
      wheel_offset: 0.78,
      axle_front: 1.545,
      axle_rear: -1.31,
      default_addons: {},
      addons: {},
    },
    tacoma_dc_lb: {
      name: 'Toyota Tacoma (Double Cab)',
      make: 'Toyota',
      model: 'assets/models/vehicles/toyota/tacoma/2g/tacoma.glb',
      wheel_offset: 0.81,
      axle_front: 1.97,
      axle_rear: -1.59,
      addons: {},
    },
    jeep_yj: {
      name: 'Jeep YJ',
      make: 'Jeep',
      model: 'assets/models/vehicles/jeep/yj/yj.glb',
      wheel_offset: 0.77,
      axle_front: 1.31,
      axle_rear: -1.09,
      default_addons: {},
      addons: {},
    },
    jeep_jku: {
      name: 'Jeep JK Unlimited',
      make: 'Jeep',
      model: 'assets/models/vehicles/jeep/jk/jku.glb',
      wheel_offset: 0.795,
      axle_front: 1.45,
      axle_rear: -1.26,
      default_addons: {},
      addons: {},
    },
    jeep_xj: {
      name: 'Jeep XJ',
      make: 'Jeep',
      model: 'assets/models/vehicles/jeep/xj/xj.glb',
      wheel_offset: 0.76,
      axle_front: 1.51,
      axle_rear: -1.24,
      default_addons: {},
      addons: {},
    },
  },
  wheels: {
    rims: {
      level_8_strike_6: {
        name: 'Level 8 Strike 6',
        model: 'assets/models/wheels/rims/level_8_strike_6.glb',
        width: 0.318,
        od: 0.488,
      },
      konig_countersteer: {
        name: 'Konig Countersteer',
        model: 'assets/models/wheels/rims/konig_countersteer.glb',
        width: 0.256,
        od: 0.47,
      },
      cragar_soft_8: {
        name: 'Cragar Soft 8',
        model: 'assets/models/wheels/rims/cragar_soft_8.glb',
        width: 0.247,
        od: 0.442,
      },
      moto_metal_mO951: {
        name: 'Moto Metal MO951',
        model: 'assets/models/wheels/rims/moto_metal_mO951.glb',
        width: 0.242,
        od: 0.407,
      },
      ar_mojave: {
        name: 'American Racing Mojave',
        model: 'assets/models/wheels/rims/ar_mojave.glb',
        width: 0.244,
        od: 0.448,
      },
    },
    tires: {
      nitto_mud_grappler: {
        name: 'Nitto Mud Grappler',
        model: 'assets/models/wheels/tires/mud_grappler.glb',
        width: 0.32,
        od: 0.883,
        id: 0.48,
      },
      bfg_at: {
        name: 'BFGoodrich A/T',
        model: 'assets/models/wheels/tires/bfg_at.glb',
        width: 0.26,
        od: 0.895,
        id: 0.43,
      },
      km2: {
        name: 'BFGoodrich KM2',
        model: 'assets/models/wheels/tires/km2.glb',
        width: 0.245,
        od: 0.837,
        id: 0.44,
      },
      thornbird: {
        name: 'Interco TSL Thornbird',
        model: 'assets/models/wheels/tires/thornbird.glb',
        width: 0.26,
        od: 0.871,
        id: 0.385,
      },
    },
  },
}

export default vehicleConfigs
