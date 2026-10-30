package peval2acda2627;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class FichaAgente {

    public static void mostrar(Connection con, String placa) throws SQLException {
        try (PreparedStatement ps = con.prepareStatement(
                "SELECT a.nombre, a.rango, c.nombre FROM agentes a JOIN comisarias c ON c.id = a.id_comisaria "
                        + "WHERE a.placa = ?")) {
            ps.setString(1, placa);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    System.out.println("No existe ningún agente con la placa " + placa);
                    return;
                }
                System.out.println("Agente: " + rs.getString(1) + "(" + rs.getString(2) + ") - Comisaria: "
                        + rs.getString(3));
            }
        }

        int total = 0;
        int sinCerrar = 0;
        try (PreparedStatement ps = con.prepareStatement(
                "SELECT c.id, t.descripcion, t.gravedad, a.rol, c.estado, d.nombre "
                        + "FROM asignaciones a JOIN casos c ON c.id = a.id_caso "
                        + "JOIN tipos_delito t ON t.id = c.id_tipo "
                        + "JOIN ciudadanos d ON d.dni = c.dni_denunciante "
                        + "WHERE a.placa_agente = ? ORDER BY c.id")) {
            ps.setString(1, placa);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    total++;
                    String estado = rs.getString(5);
                    if (!estado.equals("CERRADO")) {
                        sinCerrar++;
                    }
                    System.out.println();
                    System.out.println("Caso: " + rs.getInt(1) + " - " + rs.getString(2) + "[" + rs.getString(3) + "]");
                    System.out.println("Rol: " + rs.getString(4) + " - Estado:" + estado);
                    System.out.println("Denunciante: " + rs.getString(6));
                }
            }
        }
        System.out.println();
        System.out.println("Numero total de casos: " + total);
        System.out.println("Casos sin cerrar: " + sinCerrar);
    }
}
