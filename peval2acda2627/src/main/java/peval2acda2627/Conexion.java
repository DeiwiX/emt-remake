package peval2acda2627;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class Conexion {

    // El enunciado indica el puerto 3306; en este equipo XAMPP usa el 3307.
    private static final int PUERTO = 3307;
    private static final String URL = "jdbc:mysql://localhost:" + PUERTO + "/comisaria"
            + "?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC";
    private static final String USUARIO = "root";
    private static final String CLAVE = "";

    public static Connection getConexion() throws SQLException {
        return DriverManager.getConnection(URL, USUARIO, CLAVE);
    }
}
