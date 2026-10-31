const storeService = require('../services/store.service');

async function list(req, res, next) {
  try {
    const stores = await storeService.listStores();
    return res.status(200).json({
      success: true,
      data: stores,
    });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const store = await storeService.createStore(req.body);
    return res.status(201).json({
      success: true,
      data: store,
    });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const store = await storeService.getStoreById(req.params.id);
    if (!store) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'STORE_NOT_FOUND',
          message: `Store with ID '${req.params.id}' was not found.`,
        },
      });
    }
    return res.status(200).json({
      success: true,
      data: store,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  create,
  getById,
};
