import { Router } from 'express';
import profile from './profile';
import auth from './auth';
import story from './story';
import social from './social';
import user from './user';
import coin from './coin';
import family from './family';
import appSetting from './appSetting';
import country from './country';
import language from './language';
import agency from './agency';

export default (router: Router): Router => {
  profile(router);
  auth(router);
  story(router);
  social(router);
  user(router);
  coin(router);
  family(router);
  appSetting(router);
  country(router);
  language(router);
  agency(router);
  return router;
};
