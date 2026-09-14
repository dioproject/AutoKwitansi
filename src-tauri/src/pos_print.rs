use crate::db;
use crate::models::PosSettings;

pub fn get_pos_settings() -> Result<PosSettings, String> {
    db::get_pos_settings().map_err(|e| e.to_string())
}

pub fn save_pos_settings(settings: &PosSettings) -> Result<(), String> {
    db::save_pos_settings(settings).map_err(|e| e.to_string())
}
