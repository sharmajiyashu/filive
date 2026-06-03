import { Router } from 'express';
import auth from './auth';
import career from './career';
import hobby from './hobby';
import helpFeedback from './helpFeedback';
import level from './level';
import user from './user';
import story from './story';
import dashboard from './dashboard';
import appSetting from './appSetting';
import store from './store';
import agency from './agency';

export default (router: Router): Router => {
  auth(router);
  career(router);
  hobby(router);
  helpFeedback(router);
  level(router);
  user(router);
  story(router);
  dashboard(router);
  appSetting(router);
  store(router);
  agency(router);
  return router;
};
