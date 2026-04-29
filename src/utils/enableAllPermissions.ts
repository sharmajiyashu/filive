export function enableAllPermissions(modules: any[]) {
  return modules.map((module) => {
    const updatedFeatures: any = {};

    Object.keys(module.features).forEach((key) => {
      updatedFeatures[key] = {
        ...module.features[key],
        enabled: true,
      };
    });

    return {
      ...module,
      enabled: true,
      features: updatedFeatures,
    };
  });
}